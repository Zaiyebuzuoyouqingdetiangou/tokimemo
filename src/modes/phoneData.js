import * as core_constants from '../core/constants.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_text from '../core/text.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
import { PHONE_DEVICE_LABEL, PHONE_KIND_LABEL, PHONE_RESERVED_APP_IDS, PHONE_VIEW_VALUES, assertPhoneConversation, isExcludedPhoneApp, isGenericOwnerLabel, isPhoneUserName, isUnavailablePhoneEntry, normalizePhoneAppIcon, normalizePhoneAppKind, normalizePhoneUiProfile, phoneAppLimits, phoneConversationOwnerName, phoneStory, unavailablePhoneEntry, verifiedPhoneOwnerMembers } from './phoneBasics.js';
import { applyPhoneChatContract, inferPhoneContactName, noPhoneConversation, normalizePhoneConversationMessages, normalizePhoneMemoryEvidence, normalizePhoneSettingEvidence, phoneControlledOwnerNames, phoneDisplayText, phoneEntryBasis, phoneInferredEntryAllowed, phoneMemoryStructuredFactsSupported, phoneReferencedMemoryText, phoneSpeaksAsUser, sanitizePhoneMemoryMessageTimes } from './phoneEvidence.js';
// 私人终端数据：旧会话迁移、条目与草稿规范化、规划规范化、补缺与完成度
// 从 modes/phone.js 原样搬出（重构阶段 2），声明文本一字未改；modes/phone.js 仍转发原有导出。

export function migrateLegacyPhoneSession(session, memoryBank = null) {
    if (!session || session.kind !== core_constants.MODE.PHONE) return session;
    const migrated = structuredClone(session);
    const deviceKind = core_constants.PHONE_DEVICE_KINDS.has(migrated.deviceKind) ? migrated.deviceKind : 'phone';
    const previousUiVersion = Number(migrated.uiVersion);
    const isLegacySession = !Number.isFinite(previousUiVersion)
        || previousUiVersion < core_constants.PHONE_SESSION_VERSION;
    const needsHomeReset = !Number.isFinite(previousUiVersion) || previousUiVersion < 2;
    migrated.deviceKind = deviceKind;
    migrated.uiVersion = core_constants.PHONE_SESSION_VERSION;
    migrated.uiProfile = normalizePhoneUiProfile(migrated.uiProfile, { data: migrated, memoryBank, deviceKind });
    migrated.apps = (Array.isArray(migrated.apps) ? migrated.apps : []).filter(app => !isExcludedPhoneApp(app) && !PHONE_RESERVED_APP_IDS.has(core_text.safeId(app?.id, ''))).map(app => {
        const label = core_text.normalizeText(app?.label, 60) || '分区';
        const kind = normalizePhoneAppKind(app?.kind, label);
        const entries = (Array.isArray(app?.entries) ? app.entries : []).map(entry => {
            const basis = core_constants.ROOM_BASIS_VALUES.has(entry?.basis) ? entry.basis : '';
            const memoryEvidence = core_text.normalizeText(entry?.sourceMemoryEvidence, 800);
            let normalizedEntry = { ...entry };
            let evidenceVerified = !isLegacySession && entry?.legacyEvidenceUnverified !== true;
            if (isLegacySession && basis === '记忆' && memoryBank) {
                const reference = core_evidence.normalizeExactMemoryReference(
                    entry?.sourceMemoryIds,
                    entry?.sourceMemoryAnchor,
                    memoryBank,
                    1,
                );
                const canonicalMemory = phoneReferencedMemoryText(reference, memoryBank);
                const excerptVerified = memoryEvidence.length >= 4
                    && !!canonicalMemory
                    && core_worldPresentation.controlledEvidenceContains(canonicalMemory, memoryEvidence);
                if (excerptVerified) {
                    const conversation = normalizePhoneConversationMessages(entry, memoryBank, { strict: false, preserveOwnerNames: kind === 'chat' });
                    const fields = (Array.isArray(entry?.fields) ? entry.fields : []).slice(0, 16).map(field => ({
                        label: core_text.normalizeText(field?.label, 100),
                        value: core_text.normalizeText(field?.value, 1000),
                    })).filter(field => field.label && field.value);
                    const contains = value => {
                        const text = core_text.normalizeText(value, 5000);
                        return !text || core_worldPresentation.controlledEvidenceContains(canonicalMemory, text)
                            || core_worldPresentation.controlledEvidenceContains(memoryEvidence, text);
                    };
                    const title = core_text.normalizeText(entry?.title, 100);
                    const titleSupported = !title || /^剧情摘录\s+\d+$/u.test(title) || contains(title);
                    const proseSupported = [entry?.meta, entry?.preview, entry?.detail, entry?.imageCaption].every(contains);
                    const structuredSupported = phoneMemoryStructuredFactsSupported(
                        kind,
                        conversation,
                        conversation.messages,
                        fields,
                        memoryEvidence,
                        canonicalMemory,
                    );
                    evidenceVerified = titleSupported && proseSupported && structuredSupported;
                    normalizedEntry = {
                        ...normalizedEntry,
                        sourceMemoryIds: reference.sourceMemoryIds,
                        sourceMemoryAnchor: reference.sourceMemoryAnchor,
                        contactName: kind === 'chat' ? conversation.contactName : core_text.normalizeText(entry?.contactName, 100),
                        messages: sanitizePhoneMemoryMessageTimes(conversation.messages, memoryEvidence, canonicalMemory),
                        fields,
                    };
                }
            }
            // A legacy setting excerpt was stored without the controlled role-card/world-book
            // envelope that authorized it. Non-empty text alone is not proof, so it remains
            // readable but explicitly unverified. Current-version sessions were already checked
            // against that envelope at generation time and retain their existing status.
            return {
                ...normalizedEntry,
                legacyEvidenceUnverified: entry?.legacyEvidenceUnverified === true || !evidenceVerified,
            };
        });
        return {
            ...app,
            label,
            kind,
            icon: normalizePhoneAppIcon(app?.icon, kind, label),
            entries,
            omittedEntryIds: core_text.cleanArray(app?.omittedEntryIds, 24, 80).filter(id => !entries.some(entry => entry.id === id)),
            legacyEvidenceUnverified: entries.some(entry => entry.legacyEvidenceUnverified === true),
        };
    });
    migrated.legacyEvidenceUnverifiedCount = migrated.apps.reduce(
        (total, app) => total + (Array.isArray(app?.entries) ? app.entries.filter(entry => entry?.legacyEvidenceUnverified === true).length : 0),
        0,
    );
    if (!migrated.apps.some(app => app.id === migrated.selectedAppId)) migrated.selectedAppId = migrated.apps[0]?.id || '';
    if (needsHomeReset) {
        migrated.view = 'home';
        migrated.selectedEntryId = '';
    } else {
        migrated.view = PHONE_VIEW_VALUES.has(migrated.view) ? migrated.view : 'home';
        const selected = migrated.apps.find(app => app.id === migrated.selectedAppId);
        if (migrated.view === 'detail' && !selected?.entries?.some(entry => entry.id === migrated.selectedEntryId)) {
            migrated.view = 'list';
            migrated.selectedEntryId = '';
        }
    }
    return migrated;
}

// Generated chat has one normalization boundary before every validator. Stored
// content is never rewritten here. Unverified history can only become a visibly
// unsent owner draft, never a newly invented received message.
export function normalizePhoneChatEntry(entry, memoryBank, options = {}) {
    if (options.trustedStored === true || isUnavailablePhoneEntry(entry)) return entry;
    const owners = phoneControlledOwnerNames(memoryBank, options);
    const contactName = inferPhoneContactName(entry, memoryBank);
    const messages = (Array.isArray(entry?.messages) ? entry.messages : []).filter(message => {
        if (core_text.normalizeText(message?.speakerRole, 20) !== 'owner') return true;
        const name = core_text.normalizeText(message?.speaker, 100);
        return owners.includes(name) || (owners.length === 1 && isGenericOwnerLabel(name));
    }).map(message => message.speakerRole === 'owner' && isGenericOwnerLabel(message.speaker)
        ? { ...message, speaker: owners[0] } : message);
    const candidate = { ...entry, contactName, messages };
    const conversation = normalizePhoneConversationMessages(candidate, memoryBank, { preserveOwnerNames: true });
    const reference = core_evidence.normalizeExactMemoryReference(entry?.sourceMemoryIds, entry?.sourceMemoryAnchor, memoryBank, 1);
    const canonical = phoneReferencedMemoryText(reference, memoryBank);
    const evidence = normalizePhoneMemoryEvidence(entry, reference, memoryBank);
    const roles = new Set(conversation.messages.map(message => message.speakerRole));
    const historical = entry?.basis === '记忆' && reference.sourceMemoryIds.length && evidence
        && roles.has('owner') && roles.has('contact')
        && phoneMemoryStructuredFactsSupported('chat', conversation, conversation.messages, [], evidence, canonical);
    if (historical) return { ...candidate, conversationMode: 'history' };
    const draft = isPhoneUserName(contactName, memoryBank) || entry?.basis === '记忆' || entry?.conversationMode === 'draft';
    const display = isPhoneUserName(contactName, memoryBank) ? phoneStory(memoryBank).userDisplay : contactName;
    const safeMessages = messages.filter(message => !phoneSpeaksAsUser([message], memoryBank)
        && (!draft || message.speakerRole === 'owner'));
    if (!safeMessages.some(message => message.speakerRole === 'owner' && core_text.normalizeText(message.text, 1200))) return unavailablePhoneEntry(entry.id);
    if (!draft) return { ...candidate, contactName: display, messages: safeMessages, conversationMode: 'daily' };
    return { ...candidate, contactName: display, basis: '推演', conversationMode: 'draft', title: `给${display}的未发送草稿`,
        meta: '未发送草稿 · 不代表历史记录', preview: '主人尚未发送的话', detail: '', fields: [], imageCaption: '',
        sourceMemoryIds: [], sourceMemoryAnchor: '', sourceMemoryEvidence: '', sourceSettingEvidence: '',
        messages: safeMessages.map(message => ({ ...message, time: '' })) };
}

export function normalizePhonePlan(data, memoryBank = null, { worldPresentation = null, controlledEvidence = '' } = {}) {
    const ownerMembers = verifiedPhoneOwnerMembers(data?.ownerMembers, memoryBank, controlledEvidence);
    const controlledProfile = worldPresentation || data?.worldPresentation || null;
    let deviceName = core_text.normalizeText(data?.deviceName, 100) || '私人终端';
    const requestedKind = core_text.normalizeText(data?.deviceKind, 40).toLowerCase();
    const inferredKind = /(?:手表|腕表|watch)/i.test(deviceName) ? 'watch' : /(?:传讯|通讯器|communicator)/i.test(deviceName) ? 'communicator' : /(?:手札|卷册|书信|信笺|账簿|册页|folio|ledger|scroll|letters?)/i.test(deviceName) ? 'folio' : /(?:魔导|水晶|灵石|符文|秘仪|relic|crystal|arcane)/i.test(deviceName) ? 'relic' : /(?:终端|terminal)/i.test(deviceName) ? 'terminal' : 'phone';
    const allowedDevices = new Set(core_text.cleanArray(controlledProfile?.allowedDevices, 12, 40));
    const controlledDefault = core_constants.PHONE_DEVICE_KINDS.has(controlledProfile?.defaultDevice) ? controlledProfile.defaultDevice : 'neutral';
    const deviceKind = controlledProfile
        ? (allowedDevices.has(requestedKind) ? requestedKind : controlledDefault)
        : (core_constants.PHONE_DEVICE_KINDS.has(requestedKind) ? requestedKind : inferredKind);
    deviceName = phoneDisplayText(deviceName, 100, PHONE_DEVICE_LABEL[deviceKind] || '私人记录载体', memoryBank);
    const limits = phoneAppLimits(deviceKind);
    const apps = [];
    const usedAppIds = new Set();
    for (const [appIndex, app] of (Array.isArray(data?.apps) ? data.apps : []).slice(0, limits.maxApps).entries()) {
        if (isExcludedPhoneApp(app)) continue;
        const requestedLabel = core_text.normalizeText(app?.label, 60) || `分区 ${appIndex + 1}`;
        const id = core_text.safeId(app?.id, `APP${String(appIndex + 1).padStart(2, '0')}`);
        if (PHONE_RESERVED_APP_IDS.has(id) || usedAppIds.has(id)) continue;
        usedAppIds.add(id);
        const kind = normalizePhoneAppKind(app?.kind, requestedLabel);
        const label = phoneDisplayText(requestedLabel, 60, PHONE_KIND_LABEL[kind] || `分区 ${appIndex + 1}`, memoryBank);
        const entries = [];
        const usedEntryIds = new Set();
        for (const [index, entry] of (Array.isArray(app?.entries) ? app.entries : []).slice(0, 24).entries()) {
            const entryId = core_text.safeId(entry?.id, `${id}_E${String(index + 1).padStart(2, '0')}`);
            if (usedEntryIds.has(entryId)) continue;
            usedEntryIds.add(entryId);
            entries.push({
                id: entryId,
                title: phoneDisplayText(entry?.title, 100, `记录 ${index + 1}`, memoryBank),
                meta: phoneDisplayText(entry?.meta, 200, '', memoryBank),
                ...(kind === 'chat' ? { contactName: core_text.normalizeText(entry?.contactName, 100),
                    conversationMode: isPhoneUserName(entry?.contactName, memoryBank) || entry?.conversationMode === 'draft' ? 'draft' : 'daily' } : {}),
            });
        }
        if (!entries.length) continue;
        apps.push({
            id,
            label,
            kind,
            ...(kind === 'chat' ? { ownerMembers } : {}),
            icon: normalizePhoneAppIcon(app?.icon, kind, label),
            summary: phoneDisplayText(app?.summary, 600, '', memoryBank),
            entries,
        });
    }
    const { minApps, minEntries } = limits;
    if (apps.length < minApps) throw new Error(`私人终端目录 App 不足：${apps.length}/${minApps}。`);
    const total = apps.reduce((sum, app) => sum + app.entries.length, 0);
    if (total < minEntries) throw new Error(`私人终端目录条目不足：${total}/${minEntries}。`);
    const lockText = phoneDisplayText(data?.lockText, 400, 'PRIVATE', memoryBank);
    const appIds = new Set(apps.map(app => app.id));
    const liveStates = {};
    for (const key of core_constants.ROOM_DAYPART_KEYS) {
        const rawState = data?.liveStates?.[key] || {};
        const badgeCounts = Object.create(null);
        const rawBadges = rawState?.badgeCounts && typeof rawState.badgeCounts === 'object' ? rawState.badgeCounts : {};
        for (const [appId, count] of Object.entries(rawBadges).slice(0, 16)) {
            if (!appIds.has(appId)) continue;
            const number = Math.max(0, Math.min(99, Math.floor(Number(count) || 0)));
            if (number > 0) badgeCounts[appId] = number;
        }
        liveStates[key] = {
            lockText: phoneDisplayText(rawState?.lockText, 400, lockText, memoryBank),
            statusLine: phoneDisplayText(rawState?.statusLine, 500, '', memoryBank),
            badgeCounts,
        };
    }
    return {
        title: '他的私人终端',
        deviceName,
        deviceKind,
        uiVersion: core_constants.PHONE_SESSION_VERSION,
        worldPresentation: controlledProfile ? structuredClone(controlledProfile) : null,
        uiProfile: normalizePhoneUiProfile(data?.uiProfile, { data: { ...data, apps }, memoryBank, deviceKind, bindPersona: true }),
        lockText,
        liveStates,
        apps,
    };
}

export function validatePhoneAppPart(data, planApp, memoryBank, deviceKind, sourceMemoryIds = null, options = {}) {
    let raw = data?.app && typeof data.app === 'object' ? data.app : data;
    if (planApp.kind === 'chat') raw = { ...raw, entries: (raw?.entries || []).map(entry => normalizePhoneChatEntry(entry, memoryBank, options)) };
    const returnedId = core_text.safeId(raw?.id, '');
    if (returnedId && returnedId !== planApp.id) throw new Error(`App ${planApp.label} 返回错误 id：${returnedId}。`);
    const expectedIds = new Set(planApp.entries.map(item => item.id));
    const entries = Array.isArray(raw?.entries) ? raw.entries : [];
    const seen = new Set();
    for (const entry of entries) {
        const id = core_text.safeId(entry?.id, '');
        if (!expectedIds.has(id) || seen.has(id)) continue;
        if (isUnavailablePhoneEntry(entry)) {
            if (options.requireLifestyleContent && !['contacts', 'chat'].includes(planApp.kind)) continue;
            seen.add(id); continue;
        }
        const preview = core_text.normalizeText(entry?.preview, 1200);
        const detail = core_text.normalizeText(entry?.detail, 5000);
        let conversation = normalizePhoneConversationMessages(entry, memoryBank, { strict: planApp.kind === 'chat', preserveOwnerNames: planApp.kind === 'chat' });
        let messages = conversation.messages;
        const fields = Array.isArray(entry?.fields) ? entry.fields.filter(field => core_text.normalizeText(field?.label, 100) && core_text.normalizeText(field?.value, 1000)).slice(0, 16) : [];
        const imageCaption = core_text.normalizeText(entry?.imageCaption, 1800);
        if (!preview || (!detail && !messages.length && !fields.length && !imageCaption)) continue;
        const basis = phoneEntryBasis(entry, planApp.kind, conversation, memoryBank, options);
        conversation = applyPhoneChatContract(conversation, memoryBank, {
            basis, ownerNames: phoneControlledOwnerNames(memoryBank, options), preserveStoredOwner: options.trustedStored === true,
        });
        messages = conversation.messages;
        const legacyStored = options.trustedStored === true && entry?.narrativeVersion !== 1;
        if (legacyStored) { seen.add(id); continue; }
        let memoryEvidence = '';
        if (basis === '记忆') {
            const reference = core_evidence.normalizeExactMemoryReference(entry?.sourceMemoryIds, entry?.sourceMemoryAnchor, memoryBank, 1);
            if (!reference.sourceMemoryIds.length) continue;
            if (sourceMemoryIds && !core_incremental.usesIncrementalMemoryId(reference.sourceMemoryIds, sourceMemoryIds)) continue;
            memoryEvidence = normalizePhoneMemoryEvidence(entry, reference, memoryBank, options);
            const canonical = phoneReferencedMemoryText(reference, memoryBank);
            if (options.trustedStored !== true && (!memoryEvidence || !phoneMemoryStructuredFactsSupported(planApp.kind, conversation, messages, fields, memoryEvidence, canonical))) continue;
        } else {
            const generatedText = [entry?.title, entry?.meta, preview, detail, imageCaption, ...messages.map(m => `${m.speaker}:${m.text}`), ...fields.map(f => `${f.label}:${f.value}`)].join('\n');
            // r45 semantics: ordinary character-life content may be generated from persona/world
            // context without a verbatim quote. Only a claim that a shared past already happened
            // requires Mxxx authority. Only known-NPC ordinary chat can use inference;
            // private contacts and user messages stay on the evidence path.
            if (!phoneInferredEntryAllowed(entry, planApp.kind, conversation, generatedText, memoryBank, options)) continue;
        }
        seen.add(id);
        if (planApp.kind === 'chat') assertPhoneConversation(messages, {
            userThread: entry.conversationMode === 'draft' || (conversation.userThread && basis !== '记忆'),
        });
    }
    if (seen.size < expectedIds.size) throw core_text.safeUserError('终端详情不完整：请补齐对应 ID 的 App 内容。普通日常允许依据人设和世界书演绎；共同过去与私人字段才需要原文证据。', 'RMT_PHONE_EVIDENCE');
    return { ...raw, id: planApp.id, label: planApp.label, kind: planApp.kind };
}

export function normalizePhoneDraftApp(data, planApp, memoryBank, deviceKind, sourceMemoryIds = null, options = {}) {
    options = { ...options, ownerMembers: options.ownerMembers || planApp.ownerMembers || [] };
    if (planApp.kind === 'chat') {
        const raw = data?.app && typeof data.app === 'object' ? data.app : data;
        if (!options.ownerMembers.length) options.ownerMembers = verifiedPhoneOwnerMembers(raw?.ownerMembers, memoryBank, options.controlledEvidence);
        data = { ...raw, entries: Array.isArray(raw?.entries) ? raw.entries.map(entry => {
            const planned = planApp.entries.find(row => row.id === entry?.id);
            if (planned?.contactName && inferPhoneContactName(entry, memoryBank) !== planned.contactName) return unavailablePhoneEntry(entry.id);
            return normalizePhoneChatEntry(entry, memoryBank, options);
        }) : raw?.entries };
    }
    const original = data?.app && typeof data.app === 'object' ? data.app : data;
    let omittedEntryIds = [];
    if (options.trustedStored === true && Array.isArray(original?.omittedEntryIds)) {
        const planIds = new Set(planApp.entries.map(entry => entry.id));
        const presentIds = new Set((original.entries || []).map(entry => entry?.id));
        omittedEntryIds = core_text.cleanArray(original.omittedEntryIds, 24, 80);
        if (omittedEntryIds.some(id => !planIds.has(id) || presentIds.has(id))) {
            throw core_text.safeUserError('App 草稿目录身份不一致，原记录保留。', 'RMT_PHONE_SOURCE_CHANGED');
        }
        planApp = { ...planApp, entries: planApp.entries.filter(entry => !omittedEntryIds.includes(entry.id)) };
    }

    if (options.allowPartial === true) {
        const raw = data?.app && typeof data.app === 'object' ? data.app : data;
        const returnedId = core_text.safeId(raw?.id, '');
        if (returnedId && returnedId !== planApp.id) throw core_text.safeUserError('App 标识与当前目录不符。', 'RMT_PHONE_EVIDENCE');
        if (!Array.isArray(raw?.entries) || raw.entries.length > 24) {
            throw core_text.safeUserError('App 返回的条目结构不完整；旧内容保留。', 'RMT_PHONE_EVIDENCE');
        }
        const candidates = raw.entries;
        const plannedIds = new Set(planApp.entries.map(entry => entry.id));
        const seenIds = new Set();
        for (const candidate of candidates) {
            const id = core_text.safeId(candidate?.id, '');
            if (!plannedIds.has(id) || seenIds.has(id)) {
                throw core_text.safeUserError('App 条目 ID 重复或不属于本次目录；旧内容保留。', 'RMT_PHONE_EVIDENCE');
            }
            seenIds.add(id);
        }
        const entries = planApp.entries.map(planned => {
            const candidate = candidates.find(entry => core_text.safeId(entry?.id, '') === planned.id);
            if (!candidate) { omittedEntryIds.push(planned.id); return null; }
            if (isUnavailablePhoneEntry(candidate)) return unavailablePhoneEntry(planned.id);
            try {
                // The exact production validator remains the only acceptance path.
                // A bad sibling has no authority to discard another validated item.
                return normalizePhoneDraftApp({ ...raw, entries: [candidate] }, { ...planApp, entries: [planned] },
                    memoryBank, deviceKind, sourceMemoryIds, { ...options, allowPartial: false }).entries[0];
            } catch { return unavailablePhoneEntry(planned.id); }
        }).filter(Boolean);
        if (!entries.some(entry => !isUnavailablePhoneEntry(entry))) {
            if (planApp.kind === 'chat') throw noPhoneConversation();
            throw core_text.safeUserError('本次没有可保存的新条目；旧内容保留，可以重试这些缺项。', 'RMT_PHONE_EVIDENCE');
        }
        return { id: planApp.id, label: planApp.label, kind: planApp.kind,
            ...(planApp.kind === 'chat' ? { ownerMembers: options.ownerMembers || [] } : {}),
            icon: normalizePhoneAppIcon(planApp.icon, planApp.kind, planApp.label),
            summary: phoneDisplayText(raw?.summary || planApp.summary, 1200, '', memoryBank), entries, omittedEntryIds };
    }
    const raw = validatePhoneAppPart(data, planApp, memoryBank, deviceKind, sourceMemoryIds, options);
    const plannedIds = new Set(planApp.entries.map(item => item.id));
    const entries = (Array.isArray(raw?.entries) ? raw.entries : []).slice(0, 24).map((entry, index) => {
        const id = core_text.safeId(entry?.id, '');
        if (!plannedIds.has(id)) return null;
        if (isUnavailablePhoneEntry(entry)) return unavailablePhoneEntry(id);
        let basis = core_constants.ROOM_BASIS_VALUES.has(entry?.basis) ? entry.basis : '设定';
        let title = core_text.normalizeText(entry?.title, 100) || planApp.entries.find(item => item.id === id)?.title || `条目 ${index + 1}`;
        let meta = core_text.normalizeText(entry?.meta, 200);
        let preview = core_text.normalizeText(entry?.preview, 1200);
        let detail = core_text.normalizeText(entry?.detail, 5000);
        let conversation = normalizePhoneConversationMessages(entry, memoryBank, { strict: planApp.kind === 'chat', preserveOwnerNames: planApp.kind === 'chat' });
        basis = phoneEntryBasis(entry, planApp.kind, conversation, memoryBank, options);
        conversation = applyPhoneChatContract(conversation, memoryBank, {
            basis, ownerNames: phoneControlledOwnerNames(memoryBank, options), preserveStoredOwner: options.trustedStored === true,
        });
        let messages = conversation.messages;
        let fields = (Array.isArray(entry?.fields) ? entry.fields : []).slice(0, 16).map(field => ({
            label: core_text.normalizeText(field?.label, 100),
            value: core_text.normalizeText(field?.value, 1000),
        })).filter(field => field.label && field.value);
        let imageCaption = core_text.normalizeText(entry?.imageCaption, 1800);
        const evidenceText = [title, meta, preview, detail, imageCaption, ...messages.map(message => `${message.speaker}:${message.text}`), ...fields.map(field => `${field.label}:${field.value}`)].join('\n');
        let reference = basis === '记忆'
            ? core_evidence.normalizeExactMemoryReference(entry?.sourceMemoryIds, entry?.sourceMemoryAnchor, memoryBank, 1)
            : { sourceMemoryIds: [], sourceMemoryAnchor: '' };
        let sourceMemoryEvidence = basis === '记忆'
            ? normalizePhoneMemoryEvidence(entry, reference, memoryBank, options)
            : '';
        const sourceSettingEvidence = basis === '设定'
            ? normalizePhoneSettingEvidence(entry, planApp, conversation, evidenceText, options.controlledEvidence, options)
            : '';
        if (options.trustedStored !== true && basis === '设定' && !sourceSettingEvidence) basis = '推演';
        // A 推演 entry is ordinary device content inferred from persona (a reminder, a
        // draft, a mundane exchange). It needs no quote, but must not smuggle in a past
        // with {{user}}. Archive-driven increments may also contain ordinary current life.
        const legacyStored = options.trustedStored === true && entry?.narrativeVersion !== 1;
        if (basis === '记忆' && !legacyStored && options.trustedStored !== true) {
            const canonical = phoneReferencedMemoryText(reference, memoryBank);
            const memoryOk = reference.sourceMemoryIds.length && sourceMemoryEvidence
                && (!sourceMemoryIds || core_incremental.usesIncrementalMemoryId(reference.sourceMemoryIds, sourceMemoryIds))
                && phoneMemoryStructuredFactsSupported(planApp.kind, conversation, messages, fields, sourceMemoryEvidence, canonical);
            if (!memoryOk) {
                conversation = applyPhoneChatContract(conversation, memoryBank, {
                    basis: '推演', ownerNames: phoneControlledOwnerNames(memoryBank, options), preserveStoredOwner: options.trustedStored === true,
                });
                if (planApp.kind === 'chat' && conversation.userThread && conversation.messages.some(message => message.speakerRole === 'owner')) {
                    basis = '推演';
                    messages = conversation.messages;
                    reference = { sourceMemoryIds: [], sourceMemoryAnchor: '' };
                    sourceMemoryEvidence = '';
                } else {
                    return null;
                }
            } else {
                messages = sanitizePhoneMemoryMessageTimes(messages, sourceMemoryEvidence, canonical);
                title = core_worldPresentation.controlledEvidenceContains(sourceMemoryEvidence, title) ? title : `剧情摘录 ${index + 1}`;
                preview = sourceMemoryEvidence;
                detail = sourceMemoryEvidence;
                meta = '';
                imageCaption = '';
                if (!['chat', 'contacts'].includes(planApp.kind)) {
                    messages = [];
                    fields = [];
                }
            }
        }
        if (!legacyStored && basis !== '记忆' && !phoneInferredEntryAllowed(entry, planApp.kind, conversation, evidenceText, memoryBank, options)) return null;
        if (!preview || (!detail && !messages.length && !fields.length && !imageCaption)) return null;
        return {
            id,
            title,
            meta,
            preview,
            detail,
            contactName: ['chat', 'contacts'].includes(planApp.kind) ? conversation.contactName : '',
            ...(planApp.kind === 'chat' ? { conversationMode: entry.conversationMode || (basis === '记忆' ? 'history' : 'daily') } : {}),
            messages,
            fields,
            imageCaption,
            basis,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
            sourceMemoryEvidence,
            sourceSettingEvidence,
            narrativeVersion: legacyStored ? 0 : 1,
            legacyEvidenceUnverified: legacyStored || (options.trustedStored === true && entry?.legacyEvidenceUnverified === true),
        };
    }).filter(Boolean);
    if (entries.length !== planApp.entries.length) throw new Error(`App ${planApp.label} 续写缓存不完整：${entries.length}/${planApp.entries.length}。`);
    return {
        id: planApp.id,
        label: planApp.label,
        kind: planApp.kind,
        ...(planApp.kind === 'chat' ? { ownerMembers: options.ownerMembers || [] } : {}),
        icon: normalizePhoneAppIcon(planApp.icon, planApp.kind, planApp.label),
        summary: phoneDisplayText(raw?.summary || planApp.summary, 1200, '', memoryBank),
        entries,
        omittedEntryIds,
    };
}

export function phoneHasMissingEntries(session) {
    return !!session?.apps?.some(app => {
        const omitted = new Set(app.omittedEntryIds || []);
        return app.entries?.some(entry => isUnavailablePhoneEntry(entry) && !omitted.has(entry.id));
    });
}

export function phoneCompletionSummary(value) {
    const planned = Array.isArray(value?.plan?.apps) ? value.plan.apps : (Array.isArray(value?.apps) ? value.apps : []);
    const completed = Array.isArray(value?.completedApps) ? value.completedApps : (Array.isArray(value?.apps) ? value.apps : []);
    let readableItems = 0, totalItems = 0, missingItems = 0, omittedItems = 0, completeApps = 0;
    for (const app of planned) {
        const entries = Array.isArray(app?.entries) ? app.entries : [];
        const saved = completed.find(item => item.id === app.id);
        const readable = entries.filter(entry => saved?.entries?.some(item => item.id === entry.id && !isUnavailablePhoneEntry(item))).length;
        const omitted = value?.plan ? entries.filter(entry => !saved?.entries?.some(item => item.id === entry.id)
            && saved?.omittedEntryIds?.includes(entry.id)).length : 0;
        const pending = entries.length - readable - omitted;
        totalItems += entries.length; readableItems += readable; missingItems += pending;
        omittedItems += value?.plan ? omitted : (saved?.omittedEntryIds?.length || 0);
        if (saved && !pending) completeApps++;
    }
    return { readableItems, totalItems, missingItems, omittedItems,
        completeApps, totalApps: planned.length, partial: readableItems > 0 && missingItems > 0 };
}

export function mergePhoneMissingEntries(previous, fresh) {
    const merged = structuredClone(previous);
    merged.entries = (previous.entries || []).filter(entry => !isUnavailablePhoneEntry(entry) || !fresh.omittedEntryIds?.includes(entry.id)).map(entry => {
        const replacement = fresh.entries?.find(item => item.id === entry.id);
        return isUnavailablePhoneEntry(entry) && replacement && !isUnavailablePhoneEntry(replacement)
            ? structuredClone(replacement) : structuredClone(entry);
    });
    if (previous.kind === 'chat') {
        merged.ownerMembers = structuredClone(fresh.ownerMembers || previous.ownerMembers || []);
        merged.omittedEntryIds = [...new Set([...(previous.omittedEntryIds || []), ...(fresh.omittedEntryIds || [])])];
    }
    return merged;
}

export function normalizePhone(data, memoryBank, { worldPresentation = null, controlledEvidence = '', trustedStored = false, preservedApps = null, directoryOnly = false } = {}) {
    const controlledProfile = worldPresentation || data?.worldPresentation || null;
    let requestedDeviceName = core_text.normalizeText(data?.deviceName, 100) || '私人终端';
    const requestedKind = core_text.normalizeText(data?.deviceKind, 40).toLowerCase();
    const inferredKind = /(?:手表|腕表|watch)/i.test(requestedDeviceName)
        ? 'watch'
        : /(?:传讯|通讯器|communicator)/i.test(requestedDeviceName)
            ? 'communicator'
            : /(?:手札|卷册|书信|信笺|账簿|册页|folio|ledger|scroll|letters?)/i.test(requestedDeviceName)
                ? 'folio'
                : /(?:魔导|水晶|灵石|符文|秘仪|relic|crystal|arcane)/i.test(requestedDeviceName)
                    ? 'relic'
                    : /(?:终端|terminal)/i.test(requestedDeviceName)
                        ? 'terminal'
                        : 'phone';
    const allowedDevices = new Set(core_text.cleanArray(controlledProfile?.allowedDevices, 12, 40));
    const controlledDefault = core_constants.PHONE_DEVICE_KINDS.has(controlledProfile?.defaultDevice) ? controlledProfile.defaultDevice : 'neutral';
    const deviceKind = controlledProfile
        ? (allowedDevices.has(requestedKind) ? requestedKind : controlledDefault)
        : (core_constants.PHONE_DEVICE_KINDS.has(requestedKind) ? requestedKind : inferredKind);
    if (!trustedStored) requestedDeviceName = PHONE_DEVICE_LABEL[deviceKind] || '私人记录载体';
    else if (deviceKind === 'neutral') requestedDeviceName = '私人记录载体';
    const limits = phoneAppLimits(deviceKind);
    const rawApps = Array.isArray(data?.apps) ? data.apps : [];
    const usedAppIds = new Set();
    const apps = rawApps.slice(0, limits.maxApps).map((app, appIndex) => {
        if (isExcludedPhoneApp(app)) return null;
        const appId = core_text.safeId(app?.id, `APP${String(appIndex + 1).padStart(2, '0')}`);
        if (PHONE_RESERVED_APP_IDS.has(appId) || usedAppIds.has(appId)) return null;
        usedAppIds.add(appId);
        if (preservedApps instanceof Map && preservedApps.has(appId)) {
            return normalizePhone({ ...data, apps: [structuredClone(preservedApps.get(appId))] }, memoryBank,
                { worldPresentation, controlledEvidence, trustedStored: true }).apps[0];
        }
        const label = core_text.normalizeText(app?.label, 60) || `分区 ${appIndex + 1}`;
        const kind = normalizePhoneAppKind(app?.kind, label);
        const usedEntryIds = new Set();
        const chatOptions = { controlledEvidence, trustedStored, ownerMembers: app.ownerMembers || [] };
        const entries = (Array.isArray(app?.entries) ? app.entries : []).slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((rawEntry, index) => {
            const entry = kind === 'chat' ? normalizePhoneChatEntry(rawEntry, memoryBank, chatOptions) : rawEntry;
            const entryId = core_text.safeId(entry?.id, `${appId}_E${String(index + 1).padStart(2, '0')}`);
            if (usedEntryIds.has(entryId)) return null;
            usedEntryIds.add(entryId);
            if (isUnavailablePhoneEntry(entry)) return unavailablePhoneEntry(entryId);
            let basis = core_constants.ROOM_BASIS_VALUES.has(entry?.basis) ? entry.basis : '设定';
            let title = core_text.normalizeText(entry?.title, 100) || `条目 ${index + 1}`;
            let meta = core_text.normalizeText(entry?.meta, 200);
            let preview = core_text.normalizeText(entry?.preview, 1200);
            let detail = core_text.normalizeText(entry?.detail, 5000);
            let conversation = normalizePhoneConversationMessages(entry, memoryBank, { strict: false, preserveOwnerNames: kind === 'chat' });
            basis = phoneEntryBasis(entry, kind, conversation, memoryBank, chatOptions);
            conversation = applyPhoneChatContract(conversation, memoryBank, {
                basis, ownerNames: phoneControlledOwnerNames(memoryBank, chatOptions), preserveStoredOwner: trustedStored,
            });
            let messages = conversation.messages;
            let fields = (Array.isArray(entry?.fields) ? entry.fields : []).slice(0, 16).map(field => ({
                label: core_text.normalizeText(field?.label, 100),
                value: core_text.normalizeText(field?.value, 1000),
            })).filter(field => field.label && field.value);
            let imageCaption = core_text.normalizeText(entry?.imageCaption, 1800);
            const evidenceText = [title, meta, preview, detail, imageCaption, ...messages.map(message => `${message.speaker}:${message.text}`), ...fields.map(field => `${field.label}:${field.value}`)].join('\n');
            const reference = basis === '记忆' ? core_evidence.normalizeExactMemoryReference(entry?.sourceMemoryIds, entry?.sourceMemoryAnchor, memoryBank, 1) : { sourceMemoryIds: [], sourceMemoryAnchor: '' };
            const sourceMemoryEvidence = basis === '记忆'
                ? normalizePhoneMemoryEvidence(entry, reference, memoryBank, { trustedStored })
                : '';
            const sourceSettingEvidence = basis === '设定'
                ? normalizePhoneSettingEvidence(entry, { kind }, conversation, evidenceText, controlledEvidence, { trustedStored })
                : '';
            if (!trustedStored && basis === '设定' && !sourceSettingEvidence) basis = '推演';
            if (!preview || (!detail && !messages.length && !fields.length && !imageCaption)
                || (!trustedStored && basis === '记忆' && (!reference.sourceMemoryIds.length || !sourceMemoryEvidence))) return null;
            if (!trustedStored && basis !== '记忆'
                && !phoneInferredEntryAllowed(entry, kind, conversation, evidenceText, memoryBank, chatOptions)) return null;
            if (basis === '记忆' && !trustedStored) {
                const canonical = phoneReferencedMemoryText(reference, memoryBank);
                if (!phoneMemoryStructuredFactsSupported(kind, conversation, messages, fields, sourceMemoryEvidence, canonical)) return null;
                if (kind === 'chat') assertPhoneConversation(messages, { userThread: conversation.userThread && basis !== '记忆' });
                messages = sanitizePhoneMemoryMessageTimes(messages, sourceMemoryEvidence, canonical);
                title = core_worldPresentation.controlledEvidenceContains(sourceMemoryEvidence, title) ? title : `剧情摘录 ${index + 1}`;
                preview = sourceMemoryEvidence;
                detail = sourceMemoryEvidence;
                meta = '';
                imageCaption = '';
                if (!['chat', 'contacts'].includes(kind)) {
                    messages = [];
                    fields = [];
                }
            }
            return {
                id: entryId,
                title,
                meta,
                preview,
                detail,
                contactName: ['chat', 'contacts'].includes(kind) ? conversation.contactName : '',
                ...(kind === 'chat' ? { conversationMode: entry.conversationMode || (basis === '记忆' ? 'history' : 'daily') } : {}),
                messages,
                fields,
                imageCaption,
                basis,
                sourceMemoryIds: reference.sourceMemoryIds,
                sourceMemoryAnchor: reference.sourceMemoryAnchor,
                sourceMemoryEvidence,
                sourceSettingEvidence,
                narrativeVersion: trustedStored ? (entry?.narrativeVersion === 1 ? 1 : 0) : 1,
                legacyEvidenceUnverified: trustedStored && entry?.legacyEvidenceUnverified === true,
            };
        }).filter(Boolean);
        const safeLabel = trustedStored ? label : phoneDisplayText(label, 60, PHONE_KIND_LABEL[kind] || `分区 ${appIndex + 1}`, memoryBank);
        const rawSummary = core_text.normalizeText(app?.summary, 1200);
        const safeSummary = trustedStored ? rawSummary : phoneDisplayText(rawSummary, 1200, '', memoryBank);
        return {
            id: appId,
            label: safeLabel,
            kind,
            ...(kind === 'chat' ? { ownerMembers: app.ownerMembers || [] } : {}),
            icon: normalizePhoneAppIcon(app?.icon, kind, safeLabel),
            summary: safeSummary,
            entries,
            omittedEntryIds: core_text.cleanArray(app?.omittedEntryIds, 24, 80).filter(id => !entries.some(entry => entry.id === id)),
            legacyEvidenceUnverified: entries.some(entry => entry.legacyEvidenceUnverified === true),
        };
    }).filter(app => app && app.entries.length >= 1);

    if (apps.length < limits.minApps) throw new Error(`“他的私人终端”分区不足：得到 ${apps.length} 个，当前设备至少需要 ${limits.minApps} 个。`);
    const totalEntries = apps.reduce((sum, app) => sum + app.entries.length, 0);
    if (totalEntries < limits.minEntries) throw new Error(`“他的私人终端”内容过少：只有 ${totalEntries} 个可读条目，至少需要 ${limits.minEntries} 个。`);
    if (!directoryOnly && !apps.some(app => app.entries.some(entry => entry.sourceStatus !== 'unavailable'))) {
        throw core_text.safeUserError('目录没有可核实原文。', 'RMT_PHONE_SOURCE_EMPTY');
    }

    const appIds = new Set(apps.map(app => app.id));
    const liveStates = {};
    for (const key of core_constants.ROOM_DAYPART_KEYS) {
        const rawState = data?.liveStates?.[key] || {};
        const badges = Object.create(null);
        const rawBadges = rawState?.badgeCounts && typeof rawState.badgeCounts === 'object' ? rawState.badgeCounts : {};
        for (const [appId, count] of Object.entries(rawBadges)) {
            if (!appIds.has(appId)) continue;
            const number = Math.max(0, Math.min(99, Math.floor(Number(count) || 0)));
            if (number > 0) badges[appId] = number;
        }
        liveStates[key] = {
            lockText: trustedStored ? (core_text.normalizeText(rawState?.lockText, 400) || core_text.normalizeText(data?.lockText, 400) || 'PRIVATE') : phoneDisplayText(rawState?.lockText || data?.lockText, 400, 'PRIVATE', memoryBank),
            statusLine: trustedStored ? core_text.normalizeText(rawState?.statusLine, 500) : phoneDisplayText(rawState?.statusLine, 500, '', memoryBank),
            badgeCounts: badges,
        };
    }
    return {
        kind: core_constants.MODE.PHONE,
        title: trustedStored ? (core_text.normalizeText(data?.title, 100) || '他的私人终端') : '他的私人终端',
        ownerName: phoneConversationOwnerName(memoryBank),
        deviceName: requestedDeviceName,
        deviceKind,
        uiVersion: core_constants.PHONE_SESSION_VERSION,
        worldPresentation: controlledProfile ? structuredClone(controlledProfile) : null,
        uiProfile: normalizePhoneUiProfile(data?.uiProfile, { data: { ...data, apps }, memoryBank, deviceKind, bindPersona: true }),
        lockText: trustedStored ? core_text.normalizeText(data?.lockText, 400) : phoneDisplayText(data?.lockText, 400, 'PRIVATE', memoryBank),
        liveStates,
        apps,
        legacyEvidenceUnverifiedCount: apps.reduce(
            (total, app) => total + app.entries.filter(entry => entry.legacyEvidenceUnverified === true).length,
            0,
        ),
        selectedAppId: apps[0].id,
        selectedEntryId: '',
        view: 'home',
    };
}
