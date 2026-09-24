import * as core_text from './text.js';

export const DIALOGUE_CONTRACT = '脚本每项只属于一个说话人：speaker 为 char/user/narrator/npc；npc 必须另给 speakerName。{{user}} 实际说出口的话必须单列 speaker="user"，同样展示气泡，不能放进 narrator 或 char。动作、神态、环境写独立 narrator 项，气泡 text 只放该人实际说出的台词，不混入其他人的话。不强行编造用户的内心独白，不按段落顺序轮流猜说话人。';

// These are syntax cues, not gender/turn-taking inference. The immediate, bounded
// lead-in must name a known subject, or qualify an already attributed row.
const SPEECH_END = /(?:说(?:道|着)?|问(?:道|着)?|答(?:道|着)?|回答(?:道)?|开口(?:道)?|嘀咕(?:道)?|嘟囔(?:道)?|喊(?:道)?|提醒(?:道)?|补充(?:道)?|笑道|轻声道|低声道)[，,：:\s]*$/u;
const NON_SPEECH = /(?:心想|心里|心中|脑子里|脑海|暗想|默念|写着|写道|写下|标着|标签|字样|名为|叫作|所谓|响起|一声)/u;
const ACTION_START = /^(?:说|问|答|道|回答|开口|嘀咕|嘟囔|喊|提醒|补充|笑|看|望|抬|低下|转|伸|点头|摇头|歪|把|眼睛|眼神|停下|拿起|放下|端起|捧起|侧过|眨|皱|拉住|挽住|靠近|走近|跑来|凑近|递给|摆手|摊手|托着|咬着|红着|仰头|回头|张开|踮|心想|心里|心中|脑子里)/u;
const ADVERB_START = /^(?:十分|非常|有些|似乎|正在|一边|忽然|突然|轻声|低声|轻轻|缓缓|主动|微微|自然|认真|好奇|不解|疑惑|平静|很|正|又|也|却|便|就|才|还|仍|先)/u;
function subjectAction(text) {
    let rest = text.trimStart().slice(0, 120);
    // Bounded token consumption instead of nested repeating regexes on model text.
    for (let i = 0; i < 16; i += 1) {
        if (ACTION_START.test(rest)) return true;
        const marker = rest.match(ADVERB_START);
        if (!marker) return false;
        const adverb = rest.match(/^[^，。！？：\n]{1,24}地/u) || marker;
        rest = rest.slice(adverb[0].length);
    }
    return false;
}
const DIRECT_TEXT = /^(?:我|我们|咱们|你|您|那你|那我|要不|别|嗯|啊|好|怎么|为什么|真的|谢谢|快|走吧)/u;

// One pure boundary for generated scripts and legacy display. No cache mutation,
// host access or provider calls. Unknown attribution remains neutral.
export function normalizeDialogueRows(raw, { characterName = '', userName = '', userAliases = [], characterAliases = [], strict = false } = {}) {
    const identities = [
        ...(Array.isArray(characterAliases) ? characterAliases : []).map(name => [core_text.normalizeText(name, 120), 'char']),
        ...(Array.isArray(userAliases) ? userAliases : []).map(name => [core_text.normalizeText(name, 120), 'user']),
        [core_text.normalizeText(characterName, 120), 'char'],
        [core_text.normalizeText(userName, 120), 'user'],
        ['{{char}}', 'char'],
        ['{{user}}', 'user'],
    ].filter(([name]) => name);
    const inputs = Array.isArray(raw) ? raw : [];
    const overBudget = () => {
        if (strict) throw new Error('对话拆分后超过 120 行或 50400 字符，请减少脚本长度后重新生成。');
        return [{ speaker: 'narrator', text: '这篇旧对话超过安全显示限额；原文仍保留在档案中。' }];
    };
    if (inputs.length > 120) return overBudget();
    const rows = [];
    let chars = 0, inputChars = 0, overflow = false;
    let pending = null;
    const push = (speaker, text, speakerName = '', unresolvedSpeaker = false) => {
        text = core_text.normalizeText(text, 50401);
        if (!text || overflow) return;
        chars += text.length;
        if (rows.length >= 120 || chars > 50400) { overflow = true; return; }
        // Preserve the resolved local identity across normalize -> save -> render.
        // Otherwise a stripped name label could be re-attributed on the second pass.
        const localName = speaker === 'char' ? (namedOwner(speakerName) === 'char' ? core_text.normalizeText(speakerName, 120) : core_text.normalizeText(characterName, 120)) : speaker === 'user'
            ? core_text.normalizeText(userName, 120) : '';
        const resolvedName = localName && namedOwner(localName) === speaker ? localName : '';
        rows.push({ speaker, text, ...(unresolvedSpeaker ? { unresolvedSpeaker: true } : {}), ...(speaker === 'npc' ? { speakerName }
            : resolvedName ? { speakerName: resolvedName } : {}) });
    };
    const namedOwner = (value, npcName = '') => {
        const matches = new Set(identities.filter(([name]) => name === value).map(([, role]) => role));
        if (matches.size) return matches.size === 1 ? [...matches][0] : 'narrator';
        return npcName && value === npcName ? 'npc' : '';
    };
    const subjectOwner = (text, npcName = '') => {
        const prefix = text.trim();
        const names = [...identities.map(([name]) => name), ...(npcName ? [npcName] : [])].sort((a, b) => b.length - a.length);
        // A prefix alone is never an identity: 小雨的妹妹 / 小雨伞店 remain unknown.
        const name = names.find(name => prefix.startsWith(name) && subjectAction(prefix.slice(name.length).trimStart()));
        return name ? namedOwner(name, npcName) : '';
    };
    const leadIn = (text, fallback = '', npcName = '') => {
        const prefix = text.trim();
        if (!prefix || prefix.length > 600) return null;
        if (/^(?:我|我们|你|您)/u.test(prefix) && !subjectAction(prefix.slice(1))) return null;
        const clauses = prefix.split(/[，,。！？!?；;\n]/u).map(part => part.trim()).filter(Boolean);
        const last = clauses.at(-1) || '';
        if (NON_SPEECH.test(last) || !(SPEECH_END.test(prefix) || /[:：]$/.test(prefix))) return null;
        let owner = '';
        for (const clause of clauses) {
            const explicit = subjectOwner(clause, npcName);
            if (explicit) owner = explicit;
            else if (/^(?:他|她|它|我)/u.test(clause) && subjectAction(clause.slice(1))) {
                owner ||= fallback;
            } else if (SPEECH_END.test(clause) && !subjectAction(clause)) {
                // A new, unknown subject (e.g. 某人 / 小雨的妹妹) blocks inheritance.
                owner = '';
            }
        }
        if (!owner && !SPEECH_END.test(prefix)) return null;
        return { owner: owner && owner !== 'narrator' ? owner : '', text: prefix };
    };
    const looksNarrative = (text, npcName = '') => /^(?:\*[^*]+\*|（[^）]+）|\([^)]*\))$/.test(text)
        || !!subjectOwner(text, npcName)
        || /^(?:他|她|它)/u.test(text) && subjectAction(text.slice(1));

    const postAttribution = (next, npcName = '') => {
        // Only an adjacent narrator's explicit 'X 说着/说完' can repair the
        // preceding bare enum. An action, gender, or alternating turn cannot.
        const text = typeof next === 'string' ? next : next?.speaker === 'narrator' ? next.text : '';
        if (typeof text !== 'string' || text.length > 600 || /[:：“”「」"]/u.test(text)) return '';
        let owner = '';
        for (const clause of text.split(/[，,。！？!?；;\n]/u).map(part => part.trim())) {
            let explicit = subjectOwner(clause, npcName);
            if (!explicit) {
                const described = identities.find(([name]) => clause.startsWith(name)
                    && /^(?:[^的，。！？:：]{1,12}的|的)?(?:眼眸|眼睛|目光|眉眼|脸颊|神情|嘴角)/u.test(clause.slice(name.length)));
                if (described) explicit = namedOwner(described[0], npcName);
            }
            if (explicit) owner = explicit;
            if (/(?:说着|说完|问完)[了]?$/u.test(clause)) {
                const attributed = explicit || (/^(?:他|她|它)/u.test(clause) && owner);
                return attributed && attributed !== 'narrator' ? attributed : '';
            }
        }
        return '';
    };

    for (let rawIndex = 0; rawIndex < inputs.length; rawIndex += 1) {
        const rawLine = inputs[rawIndex];
        const line = typeof rawLine === 'string' ? { speaker: 'narrator', text: rawLine } : rawLine;
        const name = core_text.normalizeText(line?.speaker, 120);
        const alias = name.toLowerCase();
        let npcName = core_text.normalizeText(line?.speakerName, 120);
        const nameOwner = namedOwner(npcName);
        const directOwner = namedOwner(name);
        let speaker = ['char', 'user', 'narrator', 'npc'].includes(alias) ? alias : directOwner || 'narrator';
        // An exact known name corrects the model's generic enum before saving and
        // before legacy rendering. Unknown names cannot borrow char's avatar.
        const conflictingNames = nameOwner && directOwner && nameOwner !== directOwner;
        if (conflictingNames) {
            if (strict) throw core_text.safeUserError('对话中的姓名标记互相冲突，原内容保留；请只重试这篇剧本。', 'RMT_HEART_INCOMPLETE');
            speaker = 'narrator';
        } else if (nameOwner) speaker = nameOwner;
        else if (npcName && speaker !== 'npc') speaker = 'narrator';
        if (speaker === 'npc' && !npcName) speaker = 'narrator';
        const identifiedCharacter = speaker === 'char' ? (nameOwner === 'char' ? npcName : directOwner === 'char' ? name : '') : '';
        if (speaker !== 'npc') npcName = '';
        const originalText = core_text.normalizeText(line?.text, 50401);
        const action = core_text.normalizeText(line?.action || line?.narration, 50401);
        inputChars += originalText.length + action.length;
        if (inputChars > 50400) return overBudget();
        if (conflictingNames || line?.unresolvedSpeaker === true) {
            // This inert flag only restricts attribution. Preserve neutrality on a
            // second render instead of turning discarded conflicting names into a guess.
            push('narrator', action);
            push('narrator', originalText, '', true);
            pending = null;
            continue;
        }
        if (action) {
            push('narrator', action);
            const cue = leadIn(action, speaker, npcName);
            pending = cue?.owner ? { owner: cue.owner, npcName } : null;
        }
        if (!originalText) { if (!action) pending = null; continue; }
        const labelled = value => {
            const match = value.match(/^\s*([^\n:：]{1,120})\s*[:：]\s*([^]*)$/);
            if (!match) return null;
            const label = match[1].trim();
            const owner = namedOwner(label, npcName)
                || (['char', 'user', 'narrator'].includes(label.toLowerCase()) ? label.toLowerCase() : '');
            if (owner) return { speaker: owner, text: match[2], speakerName: namedOwner(label) === 'char' ? label : '' };
            // Speech/action leads with a colon are not unknown speaker labels.
            if (leadIn(`${label}：`, speaker, npcName)) return null;
            if (/^[\p{L}\p{N}_·]{1,12}$/u.test(label) && !/^(?:我|我们|你|您|我的|意思|例如|注意)/.test(label)) return { speaker: 'narrator', text: value };
            return null;
        };
        const physicalLines = originalText.split(/\r?\n/);
        const hasLabels = physicalLines.some(value => labelled(value));
        for (const value of hasLabels ? physicalLines : [originalText]) {
            if (overflow) break;
            const inherited = pending;
            pending = null; // Only the immediately following utterance can consume a cue.
            const tagged = hasLabels ? labelled(value) : null;
            const text = (tagged ? tagged.text : value).trim();
            let rowSpeaker = tagged ? tagged.speaker : hasLabels ? 'narrator' : speaker;
            let rowNpcName = tagged?.speakerName || npcName || identifiedCharacter;
            if (!text) continue;
            const narrative = looksNarrative(text, npcName);
            if (inherited && !tagged && !nameOwner && !directOwner && !npcName && !narrative
                && (rowSpeaker !== 'narrator' || /^[“「"]/.test(text) || DIRECT_TEXT.test(text))) {
                rowSpeaker = inherited.owner;
                rowNpcName = inherited.npcName;
            }
            if (!tagged && !nameOwner && !directOwner && !npcName && !narrative && !hasLabels
                && (rowSpeaker !== 'narrator' || /^[“「"]/.test(text) || DIRECT_TEXT.test(text))) {
                const post = postAttribution(inputs[rawIndex + 1], rowNpcName);
                if (post && (!inherited || inherited.owner === post)) rowSpeaker = post;
            }
            let cursor = 0, split = false, quoteNarration = false, lastOwner = rowSpeaker;
            for (const quote of text.matchAll(/“([^”]*)”|「([^」]*)」|"([^"\n]*)"/g)) {
                const before = text.slice(cursor, quote.index).trim();
                const cue = leadIn(before, lastOwner, rowNpcName);
                if (cue) quoteNarration = true;
                const tail = text.slice(quote.index + quote[0].length).replace(/^[，,\s]+/, '');
                const postLead = !before ? tail.split(/[，,。！？!?；;\n]/u)[0] : '';
                const postOwner = postLead && subjectOwner(postLead, rowNpcName)
                    && SPEECH_END.test(postLead) ? leadIn(postLead, '', rowNpcName)?.owner : '';
                // A quote is not by itself a speech cue. In particular, sound effects,
                // thoughts and quoted words remain in their original paragraph.
                const quotedRow = !before && rowSpeaker !== 'narrator'
                    && (!tail.trim() || looksNarrative(postLead, rowNpcName) || leadIn(postLead, rowSpeaker, rowNpcName)?.owner);
                const owner = cue?.owner || postOwner || (quotedRow ? rowSpeaker : '');
                if (!owner) continue;
                push('narrator', text.slice(cursor, quote.index));
                push(owner, quote[1] ?? quote[2] ?? quote[3], rowNpcName);
                lastOwner = owner;
                cursor = quote.index + quote[0].length;
                split = true;
                if (overflow) break;
            }
            if (split) {
                push('narrator', text.slice(cursor));
                continue;
            }
            // Legacy unquoted dialogue can still be recovered from a named lead-in.
            const colon = text.search(/[:：]/);
            const inlineCue = colon >= 0 ? leadIn(text.slice(0, colon + 1), rowSpeaker, rowNpcName) : null;
            if (inlineCue?.owner && text.slice(colon + 1).trim() && !/[“”「」"]/.test(text.slice(colon + 1))) {
                push('narrator', text.slice(0, colon + 1));
                push(inlineCue.owner, text.slice(colon + 1), rowNpcName);
                continue;
            }
            const cue = leadIn(text, rowSpeaker, rowNpcName);
            if (cue || narrative || quoteNarration) {
                push('narrator', text);
                if (cue?.owner && /[:：]$/.test(text)) pending = { owner: cue.owner, npcName: rowNpcName };
            } else {
                push(rowSpeaker, text, rowNpcName);
            }
        }
        if (overflow) return overBudget();
    }
    if (overflow) return overBudget();
    if (strict) return rows;
    // Old normalizers may already have removed the quotation marks and saved a
    // sound as three narrator rows. Only this unambiguous fragment shape is joined
    // for display; no words/quotes are invented and the stored array is untouched.
    const displayed = [];
    for (let i = 0; i < rows.length; i += 1) {
        const first = rows[i], sound = rows[i + 1], tail = rows[i + 2];
        if (first.speaker === 'narrator' && sound?.speaker === 'narrator' && tail?.speaker === 'narrator'
            && /(?:脑子里|脑海里|心里|耳边|耳畔|传来|响起)$/.test(first.text)
            && /^[轰砰咚嗡啪怦哐叮咔]{1,4}$/.test(sound.text) && /^的(?:一声|声音|声响)/.test(tail.text)) {
            displayed.push({ speaker: 'narrator', text: first.text + sound.text + tail.text });
            i += 2;
        } else displayed.push(first);
    }
    return displayed;
}

