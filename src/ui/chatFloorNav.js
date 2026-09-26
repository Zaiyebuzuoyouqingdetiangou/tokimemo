// 壳挂在这条消息里面。聊天表面的直接子节点必须仍是消息本身，旁边多一个 div 会让 TT 停掉虚拟化。不改 message.mes。

export function messageElement(index, root = document) {
    if (!Number.isSafeInteger(index) || index < 0) return null;
    return root.querySelector(`#chat .mes[mesid="${index}"]`) || root.querySelector(`.mes[mesid="${index}"]`);
}

export function placeAfterMessage(messageNode, createElement = tag => document.createElement(tag)) {
    const parent = messageNode?.querySelector?.('.mes_block') || messageNode;
    if (!parent?.appendChild) return null;
    const host = createElement('div');
    host.className = 'rmt-floor-shell';
    host.dataset.rmtFloorShell = '1';
    parent.appendChild(host);
    return host;
}

export function writesMessageText() {
    return false;
}

export function highlightFloor(floor, root = document) {
    const value = Math.floor(Number(floor));
    if (!Number.isSafeInteger(value) || value < 1) return { ok: false, mesid: null };
    const node = messageElement(value - 1, root);
    if (!node) return { ok: false, mesid: value - 1 };
    root.querySelectorAll?.('.rmt-floor-return')?.forEach(item => item.classList.remove('rmt-floor-return'));
    node.classList.add('rmt-floor-return');
    try { node.scrollIntoView({ block: 'center' }); }
    catch { try { node.scrollIntoView(); } catch { /* 滚动失败只放弃跳转，不改成就。 */ } }
    return { ok: true, mesid: value - 1 };
}
