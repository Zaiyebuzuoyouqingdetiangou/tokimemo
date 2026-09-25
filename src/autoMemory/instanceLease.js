// Web Locks 不可用时的 IndexedDB 租约。过期后才能被别的页面接管，接管前要看已经完成的步骤。

export const LEASE_TTL_MS = 20000;
export const LEASE_HEARTBEAT_MS = 8000;

export function leaseKey(chatId) {
    return 'lease:' + encodeURIComponent(String(chatId || ''));
}

export function groupChatNotice(context) {
    if (!context?.groupId) return '';
    return '心迹回廊当前只支持单角色聊天，群聊不会自动留忆。';
}

export function decideLease(current, request, now) {
    const owner = String(request?.owner || '');
    const chatId = String(request?.chatId || '');
    const dueFloor = Math.floor(Number(request?.dueFloor));
    const archiveRevision = String(request?.archiveRevision || '');
    if (!owner || !chatId || !Number.isSafeInteger(dueFloor) || dueFloor < 0 || !archiveRevision || !Number.isFinite(now)) {
        return { granted: false, takeover: false, lease: current || null };
    }
    const expired = !current || !Number.isFinite(Number(current.expiresAt)) || Number(current.expiresAt) <= now;
    const same = current?.owner === owner;
    if (current && !expired && !same) return { granted: false, takeover: false, lease: current };
    const lease = {
        key: leaseKey(chatId),
        chatId,
        dueFloor,
        archiveRevision,
        owner,
        expiresAt: now + LEASE_TTL_MS,
        heartbeatAt: now,
    };
    return { granted: true, takeover: !!(current && expired && !same), lease };
}

export function heartbeatLease(lease, owner, now) {
    if (!lease || lease.owner !== owner || !Number.isFinite(now)) return null;
    return { ...lease, expiresAt: now + LEASE_TTL_MS, heartbeatAt: now };
}

// skip：步骤已经完成，不能因为锁过期再发请求。resume / reuse：接着原来的票据。round：可以开始新的一轮。
export function takeoverDecision(snapshot) {
    const steps = Array.isArray(snapshot?.modulePlan?.steps) ? snapshot.modulePlan.steps : [];
    if (steps.length && steps.every(step => step?.status === 'completed')) return 'skip';
    if (steps.some(step => step?.status === 'completed')) return 'resume';
    const id = snapshot?.plan?.activeDrawTicketId;
    const ticket = (snapshot?.drawTickets || []).find(item => item?.id === id);
    if (ticket && (ticket.status === 'drawn' || ticket.status === 'running')) return 'reuse';
    return 'round';
}

export async function claimWith(compare, request, now) {
    let decision = null;
    await compare(leaseKey(request?.chatId), current => {
        decision = decideLease(current, request, now);
        return decision.granted ? decision.lease : undefined;
    });
    return decision || { granted: false, takeover: false, lease: null };
}

export async function renewWith(compare, lease, now) {
    const next = heartbeatLease(lease, lease?.owner, now);
    if (!next) return null;
    let renewed = null;
    await compare(lease.key, current => {
        renewed = heartbeatLease(current, lease.owner, now);
        return renewed || undefined;
    });
    return renewed;
}

export async function releaseWith(compare, lease) {
    await compare(lease?.key, current => current?.owner === lease?.owner ? null : undefined);
}
