// Keep editor dialogs inside the host's native dialog, but outside its scrolling
// body. A fixed descendant of that body can be clipped behind the workspace tabs.
export function mountEditorDialog(body, onDismiss) {
    const shade = body?.querySelector?.('.rmt-mve-sheet-shade');
    const shell = body?.closest?.('.rmt-shell');
    if (!shade || !shell?.appendChild) return null;
    shell.appendChild(shade);
    const siblings = [...shell.children].filter(node => node !== shade);
    const previous = siblings.map(node => [node, node.inert]);
    for (const [node] of previous) node.inert = true;
    const dismiss = event => {
        if (event.type === 'click' && event.target !== shade) return;
        if (event.type === 'keydown' && event.key !== 'Escape') return;
        event.preventDefault(); event.stopPropagation(); onDismiss();
    };
    shade.addEventListener('click', dismiss);
    shade.addEventListener('keydown', dismiss);
    // Native <dialog> cancellation (Escape/back on supporting WebViews) should
    // dismiss the inner panel before closing the entire editor.
    const host = shell.closest?.('dialog');
    const cancel = event => { event.preventDefault(); event.stopImmediatePropagation(); onDismiss(); };
    host?.addEventListener('cancel', cancel, true);
    return { element: shade, dispose() {
        shade.removeEventListener('click', dismiss); shade.removeEventListener('keydown', dismiss);
        host?.removeEventListener('cancel', cancel, true);
        for (const [node, value] of previous) node.inert = value;
        shade.remove();
    } };
}
