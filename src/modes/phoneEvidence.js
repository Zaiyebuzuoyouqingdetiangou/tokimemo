import * as core_constants from '../core/constants.js';
import * as core_narrativeAuthority from '../core/narrativeAuthority.js';
import * as core_participants from '../core/participants.js';
import * as core_text from '../core/text.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
import { PHONE_MESSAGE_ROLES, assertPhoneConversation, isGenericContactLabel, isGenericOwnerLabel, isPhoneOwnerName, isPhoneUserName, phoneConversationOwnerName, phoneStory } from './phoneBasics.js';
// 私人终端证据：通讯主人、联系人推断、消息规范化、记忆与设定证据、推演条目许可
// 从 modes/phone.js 原样搬出（重构阶段 2），声明文本一字未改；modes/phone.js 仍转发原有导出。

export function applyPhoneChatContract(conversation, memoryBank, { basis = '', ownerNames = [], preserveStoredOwner = false } = {}) {
    const story = phoneStory(memoryBank);
    const userThread = isPhoneUserName(conversation?.contactName, memoryBank);
    if (!userThread) return { ...conversation, userThread: false };
    const selectedOwner = core_text.normalizeText(conversation?.ownerName, 100);
    const ownerName = preserveStoredOwner && selectedOwner
        ? selectedOwner
        : (ownerNames.includes(selectedOwner) ? selectedOwner : (story.ownerNames[0] || selectedOwner));
    const messages = basis === '记忆'
        ? conversation.messages
        : (conversation.messages || []).filter(message => message.speakerRole === 'owner' && !isPhoneUserName(message.speaker, memoryBank))
            .map(message => ({
                ...message,
                speakerRole: 'owner',
                speaker: ownerNames.includes(message.speaker) ? message.speaker : ownerName,
            }));
    return { ...conversation, contactName: story.userDisplay, ownerName, messages, userThread: true };
}

export function phoneControlledOwnerNames(memoryBank, options = {}) {
    // Explicit archive membership is already user controlled, including old
    // multi-card archives. Never substitute the card title for an empty roster.
    const roster = core_participants.normalizeParticipantRoster(memoryBank?.[core_participants.PARTICIPANTS_KEY]);
    if (roster) return roster.people.filter(person => roster.selectedIds.includes(person.id)
        && person.identity !== 'user' && !isPhoneUserName(person.name, memoryBank)).map(person => person.name);
    const names = [];
    const evidence = String(options.controlledEvidence || '');
    for (const row of options.ownerMembers || []) {
        const name = core_text.normalizeText(row?.name, 100);
        const quote = core_text.normalizeText(row?.sourceEvidence, 800);
        if (name && !isPhoneUserName(name, memoryBank) && quote.length >= 4 && quote.includes(name)
            && core_worldPresentation.controlledEvidenceContains(evidence, quote)) names.push(name);
    }
    return names.length ? [...new Set(names)] : [phoneConversationOwnerName(memoryBank)];
}

export function noPhoneConversation() {
    const error = core_text.safeUserError('通讯没有可保存的对话；请补充合法对象或主人一侧草稿后再生成。', 'RMT_PHONE_NO_CONVERSATION');
    error.nonRetryable = true;
    return error;
}

export function inferPhoneContactName(entry, memoryBank) {
    const ownerName = phoneConversationOwnerName(memoryBank);
    const explicit = core_text.normalizeText(entry?.contactName, 100).trim();
    if (explicit && explicit !== ownerName && !isGenericOwnerLabel(explicit) && !isGenericContactLabel(explicit)) return explicit;

    const story = phoneStory(memoryBank);
    const title = core_text.normalizeText(entry?.title, 100).trim();
    const meta = core_text.normalizeText(entry?.meta, 200).trim();
    const mentionedUser = story.userAliases.find(name => name && name !== ownerName && `${title} ${meta}`.includes(name));
    if (mentionedUser) return story.userDisplay;

    for (const message of Array.isArray(entry?.messages) ? entry.messages : []) {
        const speaker = core_text.normalizeText(message?.speaker, 100).trim();
        if (!speaker || speaker === ownerName || isGenericOwnerLabel(speaker) || isGenericContactLabel(speaker)) continue;
        return speaker;
    }

    const patterns = [
        /^(?:与|和|跟)\s*(.+?)(?:的)?(?:聊天|对话|消息|通讯|私信)?$/u,
        /^(.+?)(?:聊天|对话|消息|通讯|私信)$/u,
    ];
    for (const pattern of patterns) {
        const match = title.match(pattern);
        const candidate = core_text.normalizeText(match?.[1], 100).trim();
        if (candidate && candidate !== ownerName && !isGenericOwnerLabel(candidate) && !isGenericContactLabel(candidate)) return candidate;
    }
    if (title && title !== ownerName && !/^(?:聊天|对话|消息|通讯|私信|群聊)$/u.test(title)) return title;
    return '联系人';
}

export function normalizePhoneConversationMessages(entry, memoryBank, { strict = false, preserveOwnerNames = false } = {}) {
    const ownerName = phoneConversationOwnerName(memoryBank);
    const contactName = inferPhoneContactName(entry, memoryBank);
    const messages = [];
    for (let index = 0; index < (Array.isArray(entry?.messages) ? entry.messages.length : 0) && messages.length < 48; index += 1) {
        const message = entry.messages[index];
        const text = core_text.normalizeText(message?.text, 1200);
        if (!text) continue;
        const rawSpeaker = core_text.normalizeText(message?.speaker, 100).trim();
        let speakerRole = core_text.normalizeText(message?.speakerRole, 20).trim().toLowerCase();
        if (strict && !PHONE_MESSAGE_ROLES.has(speakerRole)) {
            throw new Error('私人终端聊天消息必须显式提供 speakerRole（owner/contact）。');
        }
        if (!PHONE_MESSAGE_ROLES.has(speakerRole)) {
            if (isPhoneOwnerName(rawSpeaker, memoryBank) || isGenericOwnerLabel(rawSpeaker)) speakerRole = 'owner';
            else if (rawSpeaker && !isGenericContactLabel(rawSpeaker)) speakerRole = 'contact';
            else if (isGenericContactLabel(rawSpeaker)) speakerRole = 'contact';
            else speakerRole = '';
        }
        const speaker = speakerRole === 'owner'
            ? ((preserveOwnerNames && rawSpeaker && !isGenericOwnerLabel(rawSpeaker)) || isPhoneOwnerName(rawSpeaker, memoryBank) ? rawSpeaker : ownerName)
            : speakerRole === 'contact'
                ? (rawSpeaker && !isGenericOwnerLabel(rawSpeaker) && !isGenericContactLabel(rawSpeaker) ? rawSpeaker : contactName)
                : (rawSpeaker || contactName);
        messages.push({
            speakerRole,
            speaker: core_text.normalizeText(speaker, 100) || (speakerRole === 'owner' ? ownerName : contactName),
            time: /^(?:[01]?\d|2[0-3]):[0-5]\d$|^\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}(?:\s+(?:[01]?\d|2[0-3]):[0-5]\d)?$/.test(core_text.normalizeText(message?.time, 40))
                ? core_text.normalizeText(message?.time, 40) : '',
            text,
        });
    }
    return { ownerName: preserveOwnerNames ? messages.find(message => message.speakerRole === 'owner')?.speaker || ownerName : ownerName, contactName, messages };
}

export function normalizePhoneSettingEvidence(entry, planApp, conversation, generatedText, controlledEvidence, { trustedStored = false } = {}) {
    const excerpt = core_text.normalizeText(entry?.sourceSettingEvidence, 800);
    if (trustedStored) return excerpt;
    if (excerpt.length < 4 || !core_worldPresentation.controlledEvidenceContains(controlledEvidence, excerpt)) return '';
    const foldedExcerpt = excerpt.replace(/\s+/g, '').toLowerCase();
    const foldedGenerated = core_text.normalizeText(generatedText, 9000).replace(/\s+/g, '').toLowerCase();
    const contactName = core_text.normalizeText(conversation?.contactName, 100);
    if (['chat', 'contacts'].includes(planApp?.kind) && contactName && !/^(?:联系人|contact)$/iu.test(contactName)
        && !foldedExcerpt.includes(contactName.replace(/\s+/g, '').toLowerCase())) return '';
    // High-impact identity claims need the same lexical fact in the quoted authority. Generic
    // lifestyle colour is still allowed, but a model cannot invent a relative or profession and
    // attach an unrelated character-card sentence as provenance.
    const guardedTerms = [
        '姐姐', '妹妹', '哥哥', '弟弟', '母亲', '父亲', '妈妈', '爸爸', '妻子', '丈夫', '女儿', '儿子', '家人',
        '侦探', '警察', '刑警', '医生', '护士', '律师', '教师', '老师', '教授', '军人', '士兵', '骑士', '法师', '作家', '画家', '歌手', '演员', '研究员', '工程师', '程序员',
        'sister', 'brother', 'mother', 'father', 'wife', 'husband', 'daughter', 'son', 'detective', 'police', 'doctor', 'nurse', 'lawyer', 'teacher', 'professor', 'soldier', 'knight', 'mage', 'writer', 'artist', 'singer', 'actor', 'researcher', 'engineer', 'programmer',
    ];
    for (const term of guardedTerms) {
        if (foldedGenerated.includes(term) && !foldedExcerpt.includes(term)) return '';
    }
    return excerpt;
}

export function assertPhoneReplacementPreservesRecords(previous, replacement) {
    for (const oldEntry of previous?.entries || []) {
        const newEntry = replacement?.entries?.find(entry => entry.id === oldEntry.id);
        if (oldEntry.sourceStatus !== 'unavailable' && (!newEntry || newEntry.sourceStatus === 'unavailable')) {
            throw core_text.safeUserError('本次没有生成出新的有据内容；旧记录保留。', 'RMT_PHONE_EVIDENCE');
        }
    }
    return replacement;
}

export function phoneReferencedMemoryText(reference, memoryBank) {
    const ids = new Set(core_text.cleanArray(reference?.sourceMemoryIds, 16, 40));
    return (Array.isArray(memoryBank?.memories) ? memoryBank.memories : [])
        .filter(memory => ids.has(core_text.normalizeText(memory?.id, 40)))
        .map(memory => [memory?.id, memory?.title, memory?.summary, ...(Array.isArray(memory?.anchors) ? memory.anchors : [])]
            .map(value => core_text.normalizeText(value, 3000)).filter(Boolean).join('\n'))
        .join('\n');
}

export function normalizePhoneMemoryEvidence(entry, reference, memoryBank, { trustedStored = false } = {}) {
    const excerpt = core_text.normalizeText(entry?.sourceMemoryEvidence, 1200);
    if (trustedStored) return excerpt;
    if (excerpt.length < 4 || !reference?.sourceMemoryIds?.length) return '';
    const canonical = phoneReferencedMemoryText(reference, memoryBank);
    return core_worldPresentation.controlledEvidenceContains(canonical, excerpt) ? excerpt : '';
}

function phoneQuoteHasSpeaker(message, conversation, canonical) {
    const speaker = core_text.normalizeText(message?.speaker, 100);
    const words = core_text.normalizeText(message?.text, 1600);
    const names = [...new Set([conversation?.ownerName, conversation?.contactName, speaker].filter(Boolean))];
    if (!speaker || !words) return false;
    const literal = canonical.split(/\r?\n/).some(line =>
        line.trim() === speaker + '：' + words || line.trim() === speaker + ': ' + words || line.trim() === speaker + ':' + words);
    if (literal) return true;
    // Attribute from source text, not model role labels. Ambiguous indirect speech
    // cannot become a private chat transcript.
    const quotes = /[“「『"]([^”」』"\n]+)[”」』"]/gu;
    let match;
    while ((match = quotes.exec(canonical))) {
        if (match[1].trim() !== words) continue;
        const prefix = canonical.slice(Math.max(0, match.index - 160), match.index)
            .split(/[\n。！？!?；;，,”」』"]/).pop().trim();
        const positions = names.map(name => ({ name, index: prefix.indexOf(name) })).filter(item => item.index >= 0).sort((a, b) => a.index - b.index);
        const escape = value => value.replace(/[.*+?^\u0024{}()|[\]\\]/g, '\\$&');
        const targets = names.map(escape).join('|');
        const verb = '(?:说|说道|道|问|回答|答道|回应|回复|写道|留言|said|asked|replied|wrote|says)';
        const syntax = new RegExp('^\\s*(?:[:：]|(?:(?:轻声|低声|笑着|补充)\\s*)?' + verb
            + '\\s*(?:(?:to\\s+)?(?:' + targets + '))?\\s*[:：]?|对(?:' + targets + ')\\s*' + verb + '\\s*[:：]?)\\s*$', 'iu');
        const subject = positions.find(item => syntax.test(prefix.slice(item.index + item.name.length)));
        if (subject?.name === speaker) return true;
    }
    return false;
}

export function phoneMemoryStructuredFactsSupported(kind, conversation, messages, fields, evidence, canonical) {
    const contains = value => {
        const needle = core_text.normalizeText(value, 1600);
        return !needle || core_worldPresentation.controlledEvidenceContains(canonical, needle)
            || core_worldPresentation.controlledEvidenceContains(evidence, needle);
    };
    if (kind === 'chat') {
        return contains(conversation?.contactName)
            && messages.length > 0
            && messages.every(message => contains(message?.text) && phoneQuoteHasSpeaker(message, conversation, canonical)
                && (message?.speakerRole === 'owner'
                    ? core_text.normalizeText(message?.speaker, 100) === core_text.normalizeText(conversation?.ownerName, 100)
                    : contains(message?.speaker)));
    }
    if (kind === 'contacts') {
        return fields.length > 0 && fields.every(field => contains(field?.label) && contains(field?.value));
    }
    return true;
}

export function sanitizePhoneMemoryMessageTimes(messages, evidence, canonical) {
    return messages.map(message => {
        const time = core_text.normalizeText(message?.time, 40);
        if (!time || core_worldPresentation.controlledEvidenceContains(canonical, time)
            || core_worldPresentation.controlledEvidenceContains(evidence, time)) return message;
        return { ...message, time: '' };
    });
}

export function phoneDisplayText(value, limit, fallback, memoryBank) {
    const story = phoneStory(memoryBank);
    const text = core_text.normalizeText(value, limit);
    return text && !core_narrativeAuthority.narrativeClaimsSharedHistory(text, {
        userName: story.userDisplay, userAliases: story.userAliases,
    }) ? text : fallback;
}

// Wording that asserts a joint past with the user. A 推演 entry that trips this is
// dropped whole rather than rewritten: fewer entries is the safe direction.
// An inferred thread may never contain a line attributed to the user.
export function phoneSpeaksAsUser(messages, memoryBank) {
    if (!Array.isArray(messages)) return false;
    return messages.some(message => {
        const speaker = core_text.normalizeText(message?.speaker, 120);
        const role = core_text.normalizeText(message?.speakerRole, 20).toLowerCase();
        if (role === 'owner' && (isGenericOwnerLabel(speaker) || isPhoneOwnerName(speaker, memoryBank))) return false;
        const ownerSelf = speaker === '我' && role === 'owner';
        return isPhoneUserName(speaker, memoryBank) || speaker === '{{user}}' || speaker.toLowerCase() === 'user' || (speaker === '我' && !ownerSelf);
    });
}

function settingContactAllowed(entry, conversation, generatedText, memoryBank, options = {}) {
    // A known ordinary contact is not a license to invent telephone/address/account
    // fields. Those remain on the existing historical-source path.
    const privateField = /(?:手机|电话|号码|邮箱|电邮|地址|住址|身份证|证件|银行|账号|帐号|密码|病历|定位|经纬度)|\b(?:phone|mobile|tel|email|e-mail|address|account|password|passport|medical|coordinates)\b/iu;
    if (privateField.test(generatedText) || /[^\s@]+@[^\s@]+\.[^\s@]+/u.test(generatedText) || conversation.messages.length) return false;
    const name = core_text.normalizeText(conversation.contactName, 100);
    if (!name || /^(?:联系人|contact)$/iu.test(name)) return false;
    // This new setting-only path is for ordinary contacts, not an additional
    // romantic partner for the character. Historical records keep their own path.
    if (!isPhoneUserName(name, memoryBank) && /(?:前任|前妻|前夫|恋人|伴侣|妻子|丈夫|老婆|老公|夫君|娘子|配偶|女朋友|男朋友)|\b(?:wife|husband|spouse|lover|girlfriend|boyfriend)\b/iu.test(generatedText)) return false;
    const quote = normalizePhoneSettingEvidence(entry, { kind: 'contacts' }, conversation, generatedText,
        options.controlledEvidence, { trustedStored: false });
    if (!quote || !core_worldPresentation.controlledEvidenceContains(quote, name)) return false;
    const fields = (Array.isArray(entry?.fields) ? entry.fields : []).slice(0, 16);
    if (!fields.length) return false;
    return fields.every(field => {
        const label = core_text.normalizeText(field?.label, 100), value = core_text.normalizeText(field?.value, 1000);
        if (!label || !value || privateField.test(label)) return false;
        // Ordinary notes may be newly written; identity, occupation and relationship
        // fields must actually be stated about this named contact in the same sentence.
        if (/^(?:备注|便签|计划|note|notes)$/iu.test(label)) return true;
        if (/^(?:姓名|名称|name)$/iu.test(label)) return value === name;
        const escape = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const subject = escape(name), fact = escape(value);
        return quote.split(/[。！？!?；;\n]+/u).some(line => {
            if (/(?:不(?:是|认识)|并非|未曾|没有|假如|如果|可能|传闻|假装|扮演|梦里|小说|剧本)|\b(?:not|never|if|maybe|fiction)\b/iu.test(line)) return false;
            // A contact's exact identity predicate, not another person's job in the same quote.
            return new RegExp(`^\\s*${subject}\\s*(?:(?:是|为)(?:一名|一位|一个)?(?:[^的。！？!?，,]{1,120}的)?|(?:的)?(?:职业|关系|身份|工作)\\s*[:：是为]\\s*)${fact}(?:[，,].*)?\\s*$`, 'u').test(line);
        });
    });
}

export function phoneInferredEntryAllowed(entry, kind, conversation, text, memoryBank, options = {}) {
    const story = phoneStory(memoryBank);
    const userThread = conversation?.userThread === true || isPhoneUserName(conversation?.contactName, memoryBank);
    if (phoneSpeaksAsUser(conversation.messages, memoryBank)) return false;
    if (!userThread && phoneSpeaksAsUser(entry?.messages, memoryBank)) return false;
    if (kind === 'contacts' && !settingContactAllowed(entry, conversation, text, memoryBank, options)) return false;
    let attributed = String(text);
    for (const alias of story.userAliases) attributed = attributed.split(alias).join('{{user}}');
    if (/(?:\{\{user\}\}|你)(?:的)?[^\n。！？]{0,12}(?:手机号码?|电话号码?|邮箱|住址|家庭地址|身份证号?|银行账号|银行卡号|密码|病历)[\s:：是为]+[^\s\n。！？]{3,}/u.test(attributed)) return false;
    if (kind === 'chat') {
        const name = conversation.contactName;
        const known = [options.controlledEvidence, phoneReferencedMemoryText({ sourceMemoryIds: (memoryBank?.memories || []).map(item => item.id) }, memoryBank)].filter(Boolean).join('\n');
        const userDraft = (userThread || isPhoneUserName(name, memoryBank)) && (entry.conversationMode === 'draft' || userThread);
        if (!name || (isPhoneUserName(name, memoryBank) && !userDraft)
            || (!userDraft && options.trustedStored !== true && !core_worldPresentation.controlledEvidenceContains(known, name))) return false;
        if (options.trustedStored !== true) {
            const ownerNames = new Set(phoneControlledOwnerNames(memoryBank, options));
            if ((entry?.messages || []).some(message => core_text.normalizeText(message?.speakerRole, 20).trim().toLowerCase() === 'owner'
                && !ownerNames.has(core_text.normalizeText(message?.speaker, 100))
                && !isPhoneOwnerName(message?.speaker, memoryBank)
                && !isGenericOwnerLabel(message?.speaker))) return false;
            if (!userDraft && conversation.messages.some(message => message.speakerRole === 'contact'
                && !core_worldPresentation.controlledEvidenceContains(known, message.speaker))) return false;
        }
        if (userDraft || entry.conversationMode === 'draft') {
            if (!conversation.messages.some(message => message.speakerRole === 'owner')) return false;
            assertPhoneConversation(conversation.messages, { userThread: true });
        } else assertPhoneConversation(conversation.messages);
    }
    return !core_narrativeAuthority.narrativeClaimsSharedHistory(text, {
        userName: story.userDisplay, userAliases: story.userAliases, secondPersonIsUser: kind !== 'chat',
    });
}

export function phoneEntryBasis(entry, kind, conversation, memoryBank, options = {}) {
    const declared = core_constants.ROOM_BASIS_VALUES.has(entry?.basis) ? entry.basis : '设定';
    if (declared !== '记忆' || options.trustedStored === true || kind === 'contacts') return declared;
    const text = [entry?.title, entry?.meta, entry?.preview, entry?.detail, entry?.imageCaption,
        ...(Array.isArray(entry?.fields) ? entry.fields : []).map(field => `${field?.label || ''}:${field?.value || ''}`),
        ...(Array.isArray(entry?.messages) ? entry.messages : []).map(message => `${message?.speaker || ''}:${message?.text || ''}`)].join('\n');
    const unquoted = text.replace(/[“「『"][^”」』"\n]*[”」』"]/gu, '');
    // A quoted "tomorrow" inside an already-recorded conversation is not a future
    // frame for that transcript. Ambiguous retrospective records keep memory rules.
    if (!/(?:正在|现在|今天|今日|明早|明晚|明天|后天|下周|下次|待会|等会|稍后|计划|准备|待办|提醒|草稿|未发送|想和|想陪|要不要)/u.test(unquoted)) return declared;
    // "basis" is a model hint, not authority. Current life content does not become
    // a historical transcript merely because that hint says memory. Never downgrade
    // actual joint history or user transcript/contact fields to avoid their checks.
    return phoneInferredEntryAllowed(entry, kind, conversation, text, memoryBank, options) ? '推演' : declared;
}
