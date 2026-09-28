// r84.178 · 跨聊天连续档案（接力）的登记表：只是数据规则，还没有接到界面和建档上。
// 一份连续档案（lineage）有若干成员聊天；任何时刻只有一个持有者能写正式档案，其余只读。
// 交接和解绑都按「持有者 + 版本号」做比较后再写（CAS），读到的不是最新就拒绝，不会出现两个可写的持有者。
const ID = /^[A-Za-z0-9_-]{1,80}$/;

function lineageError(message, code = 'RMT_LINEAGE') {
    const error = new Error(message);
    Object.assign(error, { code, safeToDisplay: true, safeUserMessage: message, retryable: false, retryableJson: false });
    return error;
}
const chatKey = value => typeof value === 'string' ? value.trim().slice(0, 240) : '';

export function emptyLineageRegistry() { return { version: 1, lineages: {} }; }

export function normalizeLineageRegistry(value) {
    const out = emptyLineageRegistry();
    const rows = value && typeof value === 'object' && value.version === 1 && value.lineages && typeof value.lineages === 'object' ? value.lineages : {};
    for (const [id, raw] of Object.entries(rows)) {
        if (!ID.test(id) || !raw || typeof raw !== 'object') continue;
        const seen = new Set();
        const members = (Array.isArray(raw.members) ? raw.members : []).map(member => ({ chatId: chatKey(member?.chatId), joinedAt: Number.isFinite(member?.joinedAt) ? member.joinedAt : 0 }))
            .filter(member => member.chatId && !seen.has(member.chatId) && seen.add(member.chatId));
        const holder = chatKey(raw.holder);
        const revision = typeof raw.revision === 'string' ? raw.revision.slice(0, 500) : '';
        if (!members.length || !members.some(member => member.chatId === holder) || !revision) continue;
        out.lineages[id] = { id, members, holder, revision, updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0 };
    }
    return out;
}

export function lineageForChat(registry, chatId) {
    const key = chatKey(chatId);
    if (!key) return null;
    for (const lineage of Object.values(normalizeLineageRegistry(registry).lineages)) {
        if (lineage.members.some(member => member.chatId === key)) return { lineage, holder: lineage.holder === key };
    }
    return null;
}

export function createLineage(registry, { id, homeChatId, revision, now = Date.now() }) {
    const next = normalizeLineageRegistry(registry);
    const home = chatKey(homeChatId);
    if (!ID.test(id || '') || !home || typeof revision !== 'string' || !revision) throw lineageError('连续档案信息不完整，没有改动。');
    if (next.lineages[id]) throw lineageError('这份连续档案已经登记过了。');
    if (lineageForChat(next, home)) throw lineageError('这个聊天已经属于另一份连续档案。');
    next.lineages[id] = { id, members: [{ chatId: home, joinedAt: now }], holder: home, revision, updatedAt: now };
    return next;
}

// 交接：把正式档案从 from 交给 to（to 可以是新成员）。只有登记的持有者和版本都对得上才写。
export function handOverLineage(registry, { id, from, to, expectedRevision, nextRevision, now = Date.now() }) {
    const next = normalizeLineageRegistry(registry);
    const lineage = next.lineages[id];
    const source = chatKey(from), target = chatKey(to);
    if (!lineage) throw lineageError('找不到这份连续档案，没有改动。');
    if (lineage.holder !== source || lineage.revision !== expectedRevision) throw lineageError('连续档案已经在别处更新过了；请重新打开后再交接。', 'RMT_LINEAGE_CAS');
    if (!target || typeof nextRevision !== 'string' || !nextRevision) throw lineageError('交接信息不完整，没有改动。');
    const other = lineageForChat(next, target);
    if (other && other.lineage.id !== id) throw lineageError('那个聊天已经属于另一份连续档案。');
    if (!lineage.members.some(member => member.chatId === target)) lineage.members.push({ chatId: target, joinedAt: now });
    Object.assign(lineage, { holder: target, revision: nextRevision, updatedAt: now });
    return next;
}

// 解绑：chatId 退出连续档案。它若是持有者，档案（含它期间新增的记忆）交还给 backTo（必须是成员）。不删任何内容。
export function detachFromLineage(registry, { id, chatId, backTo = '', expectedRevision, nextRevision = expectedRevision, now = Date.now() }) {
    const next = normalizeLineageRegistry(registry);
    const lineage = next.lineages[id];
    const leaving = chatKey(chatId);
    if (!lineage || !lineage.members.some(member => member.chatId === leaving)) throw lineageError('这个聊天不在这份连续档案里，没有改动。');
    if (lineage.revision !== expectedRevision) throw lineageError('连续档案已经在别处更新过了；请重新打开后再解绑。', 'RMT_LINEAGE_CAS');
    const rest = lineage.members.filter(member => member.chatId !== leaving);
    if (!rest.length) throw lineageError('这是这份连续档案的最后一个聊天，不能解绑。');
    if (lineage.holder === leaving) {
        const target = chatKey(backTo);
        if (!rest.some(member => member.chatId === target)) throw lineageError('请选一个仍在这份连续档案里的聊天来接回档案。');
        lineage.holder = target;
        lineage.revision = nextRevision;
    }
    lineage.members = rest;
    lineage.updatedAt = now;
    return next;
}
