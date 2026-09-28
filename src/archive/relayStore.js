import * as backup from './backupStore.js';
import * as policy from '../core/archiveRelayPolicy.js';
import * as constants from '../core/constants.js';
import * as context from '../core/context.js';

const copy = value => value == null ? value : structuredClone(value);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const checkpointKey = id => `relay-checkpoint:${id}`;

async function readRecord(key) {
    return backup.archiveBackupTransaction('readonly', tx => new Promise((resolve, reject) => {
        let result;
        const request = tx.objectStore(constants.ARCHIVE_BACKUP_STORE_NAME).get(key);
        request.onsuccess = () => { result = request.result || null; };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error || policy.relayError('接力登记读取未完成，原内容保留。'));
    }));
}

export async function readArchiveRelayState(entry) {
    return backup.readArchiveRelayState(entry);
}

export async function readRelayCheckpoint(id) { return readRecord(checkpointKey(id)); }

export async function handoffArchiveBackup(input) {
    const { sourceEntry, targetEntry, sourceExpected, targetExpected, memory, cache, transferId } = input;
    const fromKey = policy.relayMemberKey(sourceEntry), toKey = policy.relayMemberKey(targetEntry);
    if (!transferId || !sourceExpected || fromKey === toKey
        || !context.archiveStoredAvatar(sourceEntry)
        || context.archiveStoredAvatar(sourceEntry) !== context.archiveStoredAvatar(targetEntry)
        || Number(sourceEntry.characterIndexHint) !== Number(targetEntry.characterIndexHint)
        || context.comparableChatId(memory?.chatId) !== context.comparableChatId(targetEntry.chatId)) {
        throw policy.relayError('交接身份不一致，没有写入。');
    }
    const prepared = backup.prepareArchiveBackupRecord(targetEntry, memory, cache);
    const result = await backup.archiveBackupTransaction('readwrite', tx => new Promise((resolve, reject) => {
        const store = tx.objectStore(constants.ARCHIVE_BACKUP_STORE_NAME);
        const values = new Map();
        let pending = 0, outcome = null, reason = null;
        const abort = error => { reason ||= error; try { tx.abort(); } catch { reject(reason); } };
        const current = () => { if (input.stillCurrent?.() === false) throw policy.relayError('交接期间聊天或角色已切换，原档案保留。'); };
        const read = (key, request) => {
            pending++;
            request.onerror = () => abort(request.error);
            request.onsuccess = () => { values.set(key, request.result || null); if (--pending === 0) finish(); };
        };
        const put = row => { const r = store.put(row); r.onerror = () => abort(r.error); r.onsuccess = () => { try { current(); } catch (e) { abort(e); } }; };
        const finish = () => {
            try {
                current();
                const oldSource = values.get('source');
                const oldTarget = values.get('target');
                if (oldSource?.deleted || oldTarget?.deleted) throw policy.relayError('所选档案已被删除；交接没有写入。');
                const source = backup.normalizeArchiveBackupRecord(oldSource, sourceEntry);
                const target = backup.normalizeArchiveBackupRecord(oldTarget, targetEntry);
                if (!source || !same(source, sourceExpected) || !same(target, targetExpected)) throw policy.relayError('来源或目标档案已更新，请重新预览后确认。');
                // Exact keys are not enough: an alias/deletion under the same chat wins.
                for (const [name, entry] of [['sourceAliases', sourceEntry], ['targetAliases', targetEntry]]) {
                    const aliases = (values.get(name) || []).filter(row => context.archiveStoredAvatar(row) === context.archiveStoredAvatar(entry)
                        && Number(row.characterIndexHint) === Number(entry.characterIndexHint));
                    if (aliases.some(row => row.deleted || row.entryId !== entry.entryId)) throw policy.relayError('档案身份或删除记录发生变化，请重新打开档案室。');
                }
                const sourceFence = policy.relayFence(values.get('sourceFence'));
                const targetFence = policy.relayFence(values.get('targetFence'));
                if (!same(sourceFence, input.sourceFence) || !same(targetFence, input.targetFence)) throw policy.relayError('这份档案已在另一个页面交接，请重新打开。');
                policy.assertRelayWrite(sourceEntry, sourceFence, source.memory);
                if (targetFence && (!sourceFence || targetFence.lineageId !== sourceFence.lineageId)) throw policy.relayError('当前聊天已加入另一份连续档案，不能自动合并。');
                const returning = !!targetFence && targetFence.lineageId === sourceFence?.lineageId;
                if (target && !returning && input.replaceTarget !== true) throw policy.relayError('当前聊天已有自己的档案，请先导出并明确选择后再接力。');
                if (values.get('checkpoint')) throw policy.relayError('这次交接已经处理过，请重新打开查看结果。');
                const epoch = (sourceFence?.epoch || 0) + 1;
                const lineageId = sourceFence?.lineageId || transferId;
                const members = copy(sourceFence?.members || [sourceEntry]);
                if (!members.some(row => policy.relayMemberKey(row) === toKey)) members.push(copy(targetEntry));
                const marker = { version: 1, lineageId, epoch };
                prepared.memory.archiveRelayV1 = marker;
                // This remains a frozen source snapshot, not a second writable archive.
                const frozen = copy(oldSource);
                frozen.memory.archiveRelayV1 = marker;
                const common = { kind: 'archive-relay-member', version: 1, lineageId, epoch, holderKey: toKey, members, transferId };
                put({ entryId: checkpointKey(transferId), kind: 'archive-relay-checkpoint', version: 1,
                    transferId, before: copy(source), targetBefore: copy(target), targetMirror: copy(input.targetMirror), after: copy(prepared), createdAt: Date.now() });
                put(frozen);
                put(prepared);
                for (const member of members) put({ ...common, entryId: policy.relayMemberKey(member) });
                outcome = { status: 'committed', record: prepared, fence: { ...common, entryId: toKey } };
            } catch (error) { abort(error); }
        };
        tx.oncomplete = () => resolve(outcome);
        tx.onabort = () => reject(reason || tx.error || policy.relayError('交接保存失败，原持有者和原内容保持不变。'));
        tx.onerror = () => { reason ||= tx.error; };
        try {
            current();
            read('source', store.get(sourceEntry.entryId));
            read('target', store.get(targetEntry.entryId));
            read('sourceFence', store.get(fromKey));
            read('targetFence', store.get(toKey));
            read('sourceAliases', store.index('chatId').getAll(sourceEntry.chatId));
            read('targetAliases', store.index('chatId').getAll(targetEntry.chatId));
            read('checkpoint', store.get(checkpointKey(transferId)));
        } catch (error) { abort(error); }
    }));
    for (const member of result.fence.members) policy.rememberRelayFence(member, { ...result.fence, entryId: policy.relayMemberKey(member) });
    return result;
}
