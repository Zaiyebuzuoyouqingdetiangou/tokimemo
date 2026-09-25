import * as core_constants from '../core/constants.js';
import * as core_incremental from '../core/incremental.js';
import * as core_text from '../core/text.js';
import { PHONE_VIEW_VALUES, isExcludedPhoneApp, isUnavailablePhoneEntry, normalizePhoneAppIcon, normalizePhoneAppKind, phoneConversationOwnerName } from './phoneBasics.js';
import { migrateLegacyPhoneSession, normalizePhone, normalizePhoneDraftApp, normalizePhonePlan } from './phoneData.js';
// 私人终端增量与进度：增量规划规范化、条目键与增量合并、进度投影
// 从 modes/phone.js 原样搬出（重构阶段 2），声明文本一字未改；modes/phone.js 仍转发原有导出。

export function projectPhoneProgress({ segments = [], memoryBank, previousSession = null, contentInputs = {}, frozenInputs = {}, operation = {} }) {
    const previous = contentInputs.previousSession ?? previousSession;
    const presentation = frozenInputs['presentation:phone'] || {};
    let plan = contentInputs.phoneDraft?.plan || null;
    let incremental = false;
    for (const segment of segments) {
        if (!segment.has('') || !/(?:^|:)(?:increment-)?plan$/.test(segment.slot || '')) continue;
        try {
            incremental = /:increment-plan$/.test(segment.slot);
            plan = incremental && previous ? normalizePhoneIncrementPlan(segment.value, previous)
                : normalizePhonePlan(segment.value, memoryBank, { worldPresentation: presentation.profile || null });
        } catch { /* A directory must pass its unchanged production contract. */ }
    }
    if (!plan && previous && operation.fillMissing === true) plan = { ...previous, apps: previous.apps || [] };
    if (!plan) return null;
    const accepted = new Map();
    const sourceIds = incremental ? core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode') : null;
    for (const segment of segments) {
        if (/(?:^|:)(?:increment-)?plan$/.test(segment.slot || '')) continue;
        const raw = segment.at?.('/app') || segment.value || {};
        const planApp = plan.apps.find(app => app.id === raw?.id);
        if (!planApp) continue;
        const rows = segment.items(segment.at?.('/app') ? '/app/entries' : '/entries');
        for (const row of rows) {
            const planned = planApp.entries.find(entry => entry.id === row?.id);
            if (!planned) continue;
            try {
                const app = normalizePhoneDraftApp({ ...raw, entries: [row] }, { ...planApp, entries: [planned] }, memoryBank, plan.deviceKind,
                    sourceIds, { controlledEvidence: presentation.settingEvidence || '', requireLifestyleContent: !incremental, allowPartial: false });
                const entry = app.entries[0];
                if (!entry || isUnavailablePhoneEntry(entry)) continue;
                const prior = accepted.get(app.id);
                if (prior) { if (!prior.entries.some(item => item.id === entry.id)) prior.entries.push(entry); }
                else accepted.set(app.id, { ...app, entries: [entry], omittedEntryIds: [] });
            } catch { /* One invalid sibling cannot hide a validated, closed entry. */ }
        }
    }
    if (!accepted.size) return null;
    const apps = [...accepted.values()];
    if (previous && incremental) {
        try { return mergePhoneIncremental(previous, apps, memoryBank, { controlledEvidence: presentation.settingEvidence || '' }).session; }
        catch { return null; }
    }
    const session = previous ? structuredClone(previous) : {
        ...structuredClone(plan), kind: core_constants.MODE.PHONE, ownerName: phoneConversationOwnerName(memoryBank),
        selectedAppId: apps[0].id, selectedEntryId: '', view: 'home', apps: [] };
    for (const app of apps) {
        const old = session.apps.find(item => item.id === app.id);
        if (old) {
            for (const entry of app.entries) {
                const index = old.entries.findIndex(item => item.id === entry.id);
                if (index < 0) old.entries.push(entry);
                else if (isUnavailablePhoneEntry(old.entries[index])) old.entries[index] = entry;
            }
        } else session.apps.push(app);
    }
    session.chatId = memoryBank.chatId; session.archiveRevision = memoryBank.archiveRevision;
    return session;
}

export function normalizePhoneIncrementPlan(data, previous) {
    if (!Array.isArray(data?.apps)) throw new Error('私人终端增量目录缺少 apps 数组。');
    const safePrevious = migrateLegacyPhoneSession(previous);
    const eligibleApps = (safePrevious.apps || []).filter(app => !isExcludedPhoneApp(app));
    const existingById = new Map(eligibleApps.map(app => [app.id, app]));
    const existingByKind = new Map(eligibleApps.map(app => [app.kind, app]));
    const rawApps = data.apps.slice(0, 10);
    const apps = rawApps.map(raw => {
        const id = core_text.safeId(raw?.id, '');
        const kind = normalizePhoneAppKind(raw?.kind, raw?.label);
        const existing = existingById.get(id) || existingByKind.get(kind);
        if (!existing) return null;
        const reservedIds = new Set((existing.entries || []).map(entry => entry.id));
        const planned = [];
        for (const item of (Array.isArray(raw?.entries) ? raw.entries : []).slice(0, 8)) {
            const entryId = core_incremental.uniqueGeneratedId(item?.id, reservedIds, `${existing.id}_N`);
            planned.push({
                id: entryId,
                title: core_text.normalizeText(item?.title, 100) || '新增条目',
                meta: core_text.normalizeText(item?.meta, 200),
            });
        }
        if (!planned.length) return null;
        return {
            id: existing.id,
            label: existing.label,
            kind: existing.kind,
            icon: normalizePhoneAppIcon(existing.icon, existing.kind, existing.label),
            incremental: true,
            summary: core_text.normalizeText(raw?.summary, 1200) || existing.summary,
            entries: planned,
        };
    }).filter(Boolean);
    const total = apps.reduce((sum, app) => sum + app.entries.length, 0);
    if (rawApps.length && !total) throw new Error('私人终端增量目录返回了 App，但没有可验证的新条目。');
    return {
        title: safePrevious.title,
        deviceName: safePrevious.deviceName,
        deviceKind: safePrevious.deviceKind,
        uiVersion: core_constants.PHONE_SESSION_VERSION,
        uiProfile: safePrevious.uiProfile,
        worldPresentation: safePrevious.worldPresentation || null,
        lockText: safePrevious.lockText,
        liveStates: safePrevious.liveStates,
        apps,
    };
}

export function phoneEntryKey(appKind, entry) {
    if (isUnavailablePhoneEntry(entry)) return `${appKind}|pending|${core_text.safeId(entry?.id, '')}`;
    const ids = core_text.cleanArray(entry?.sourceMemoryIds, 8, 40).sort().join(',');
    const anchor = core_incremental.normalizedContentKey(entry?.sourceMemoryAnchor, 140);
    return ids && anchor
        ? `${appKind}|memory|${ids}|${anchor}`
        : `${appKind}|${core_incremental.normalizedContentKey(entry?.title, 120)}|${core_incremental.normalizedContentKey(entry?.meta, 200)}`;
}

export function mergePhoneIncremental(previous, patches, memoryBank, options = {}) {
    const safePrevious = migrateLegacyPhoneSession(previous, memoryBank);
    const merged = structuredClone(safePrevious);
    let added = 0;
    for (const patchApp of patches || []) {
        const target = merged.apps.find(app => app.id === patchApp.id) || merged.apps.find(app => app.kind === patchApp.kind);
        if (!target) continue;
        const seen = new Set((target.entries || []).map(entry => phoneEntryKey(target.kind, entry)));
        const usedIds = new Set((target.entries || []).map(entry => entry.id));
        for (const entry of patchApp.entries || []) {
            const key = phoneEntryKey(target.kind, entry);
            if (!key || seen.has(key) || target.entries.length >= core_constants.MAX_DERIVED_CONTENT_ITEMS) continue;
            seen.add(key);
            target.entries.push({ ...structuredClone(entry), id: core_incremental.uniqueGeneratedId(entry.id, usedIds, `${target.id}_N`) });
            added += 1;
        }
    }
    const normalized = normalizePhone(merged, memoryBank, {
        worldPresentation: safePrevious.worldPresentation || null,
        controlledEvidence: options.controlledEvidence || '',
        // Existing rows came from the already-persisted session; every incoming patch has already
        // passed normalizePhoneDraftApp. Avoid reclassifying old rows as new untrusted output.
        trustedStored: true,
    });
    normalized.selectedAppId = safePrevious.selectedAppId || normalized.selectedAppId;
    normalized.selectedEntryId = safePrevious.selectedEntryId || '';
    normalized.view = PHONE_VIEW_VALUES.has(safePrevious.view) ? safePrevious.view : 'home';
    return { session: normalized, added };
}
