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
