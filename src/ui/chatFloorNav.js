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
    if (!Number.isSafeInteger(value) || value < 0) return { ok: false, mesid: null };
    const mark = () => {
        const node = messageElement(value, root);
        if (!node) return false;
        root.querySelectorAll?.('.rmt-floor-return')?.forEach(item => item.classList.remove('rmt-floor-return'));
        node.classList.add('rmt-floor-return');
        try { node.scrollIntoView({ block: 'center' }); } catch { /* 滚动失败只放弃高亮。 */ }
        return true;
    };
    // /chat-jump 走酒馆自己的楼层滚动，虚拟列表也能翻到。界面先关掉，再移动聊天。
    try { triggerSlash(`/chat-jump ${value}`); } catch { /* 没有斜杠命令时仍尝试直接滚到已渲染的楼。 */ }
    if (!mark()) setTimeout(mark, 80);
    return { ok: true, mesid: value };
}

// 档案楼号从 1 计数，聊天上印出来的 # 是 mesid。回到当时用印出来的那个数。
export function displayedMesid(storedFloor) {
    const value = Math.floor(Number(storedFloor));
    if (!Number.isSafeInteger(value) || value < 1) return null;
    return value - 1;
}
