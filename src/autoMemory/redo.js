// 信封上的补成就、未完成重试，以及当前这一份怎么再写。次数沿用插件已有的自动重试档，不再另设一档。

export const SOURCE_STAMP_KEY = 'autoMemorySourceStampV1';

export function shouldAutoRepair({ enabled = false, used = 0, limit = 1 } = {}) {
  if (enabled !== true) return false;
  const cap = Math.max(1, Math.min(5, Math.floor(Number(limit)) || 1));
  const count = Math.max(0, Math.floor(Number(used)) || 0);
  return count < cap;
}

export function retryableFailure(error) {
  if (!error) return true;
  if (error.name === 'AbortError' || error.nonRetryable === true) return false;
  const code = `${error.code || ''} ${error.status || ''}`;
  return !/quota|429|config|preflight|unauthorized/i.test(code);
}

export function pendingReveal(snapshot) {
  const rows = Array.isArray(snapshot?.revealRecords) ? snapshot.revealRecords : [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index]?.status === 'achievement_pending') return rows[index];
  }
  return null;
}

export function achievementRepairPrompt({ moduleTitle = '', sourceMemoryIds = [], allowHistorical = false } = {}) {
  const title = String(moduleTitle || '这份回忆').slice(0, 40);
  const ids = (Array.isArray(sourceMemoryIds) ? sourceMemoryIds : []).filter(id => /^M\d{3,6}$/.test(id));
  const evidence = ids.length ? ids.join('、') : '没有可引用的编号';
  const kind = allowHistorical ? 'historical 或 collection' : 'collection';
  return `只补这一份回忆的成就，不要重写模块正文。模块：${title}。可以引用的记忆编号：${evidence}。
只返回一个 JSON 对象，不要解释：
{"title":"不超过40字","description":"一句","unlockCondition":"一句","kind":"${allowHistorical ? 'historical' : 'collection'}","sourceMemoryAnchor":"编号或一句"}
kind 只能是 ${kind}。没有编号证据就用 collection。`;
}

export function achievementPacket(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.achievement && typeof value.achievement === 'object' && !Array.isArray(value.achievement))
    return value.achievement;
  return value;
}

export function resetModuleSteps(modulePlan) {
  if (!modulePlan?.steps?.length) return modulePlan;
  return {
    ...modulePlan,
    steps: modulePlan.steps.map(step => ({ ...step, status: 'pending', recoverySlot: '' })),
  };
}

export function modulePlanForRetry(modulePlan) {
  const steps = modulePlan?.steps || [];
  if (!steps.length || steps.some(step => step.status !== 'completed')) return modulePlan;
  return {
    ...modulePlan,
    steps: steps.map((step, index) =>
      index === steps.length - 1 ? { ...step, status: 'pending', recoverySlot: '' } : step,
    ),
  };
}

export function currentDrawTicket(snapshot) {
  const tickets = Array.isArray(snapshot?.drawTickets) ? snapshot.drawTickets : [];
  const activeId = snapshot?.plan?.activeDrawTicketId;
  if (activeId) {
    const active = tickets.find(item => item.id === activeId);
    if (active) return active;
  }
  return tickets.length ? tickets[tickets.length - 1] : null;
}

export function choosableModules(modules) {
  return (Array.isArray(modules) ? modules : [])
    .filter(item => item?.inDrawPool === true && item.autoEligible === true && item.achievementMerged === true)
    .map(item => ({ id: item.id, title: item.title || item.id }));
}

export function redrawModuleId(candidates, currentId, randomUnit = 0) {
  const ids = (Array.isArray(candidates) ? candidates : [])
    .map(item => item?.id)
    .filter(id => typeof id === 'string' && id);
  const others = ids.filter(id => id !== currentId);
  const pool = others.length ? others : ids;
  if (!pool.length) return '';
  const unit = Math.min(0.999999, Math.max(0, Number(randomUnit) || 0));
  return pool[Math.min(pool.length - 1, Math.floor(unit * pool.length))];
}

export function drawFloorMessage(chat, dueFloor, latestFloor) {
  const floor = Math.floor(Number(dueFloor));
  const list = Array.isArray(chat) ? chat : [];
  if (floor < 1) return null;
  if (latestFloor === true) {
    let seen = 0;
    for (let index = 0; index < list.length; index += 1) {
      const message = list[index];
      if (!message || message.is_user === true || message.is_system === true) continue;
      seen += 1;
      if (seen === floor) return { index, message };
    }
    return null;
  }
  const index = floor - 1;
  const message = list[index];
  return message ? { index, message } : null;
}

export function bodyHash(text) {
  const value = String(text ?? '');
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (Math.imul(hash, 33) + value.charCodeAt(index)) >>> 0;
  return `${value.length}:${hash}`;
}

export function sourceStamp(chat, dueFloor, latestFloor, drawId) {
  const located = drawFloorMessage(chat, dueFloor, latestFloor);
  if (!located || typeof drawId !== 'string' || !drawId) return null;
  return {
    drawId,
    dueFloor: Math.floor(Number(dueFloor)),
    latestAssistant: latestFloor === true,
    messageIndex: located.index,
    hash: bodyHash(located.message?.mes),
  };
}

export function swipeNeedsRegenerate({ stamp = null, messageIndex = -1, hash = '', ticketMessageIndex = -1 } = {}) {
  if (!Number.isInteger(messageIndex) || messageIndex < 0) return false;
  if (stamp && Number.isInteger(stamp.messageIndex)) {
    if (stamp.messageIndex !== messageIndex) return false;
    return stamp.hash !== hash;
  }
  return Number.isInteger(ticketMessageIndex) && ticketMessageIndex === messageIndex;
}
