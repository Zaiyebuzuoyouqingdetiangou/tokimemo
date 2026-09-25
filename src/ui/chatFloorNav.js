// 楼尾入口是消息后面的兄弟节点。不改 message.mes，也不把界面文字交给模型。

export function messageElement(index, root = document) {
    if (!Number.isSafeInteger(index) || index < 0) return null;
    return root.querySelector(`#chat .mes[mesid="${index}"]`) || root.querySelector(`.mes[mesid="${index}"]`);
}

export function placeAfterMessage(messageNode, createElement = tag => document.createElement(tag)) {
    if (!messageNode?.insertAdjacentElement) return null;
    const host = createElement('div');
    host.className = 'rmt-floor-shell';
    host.dataset.rmtFloorShell = '1';
    messageNode.insertAdjacentElement('afterend', host);
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
