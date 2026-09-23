// Toolbar icons are owned locally so the archive chrome does not depend on host icon fonts.
export const TOOLBAR_ICON_NAMES = Object.freeze(['back', 'library', 'expand', 'add', 'manage', 'tasks', 'more', 'close']);

const paths = Object.freeze({
    back: '<path d="M14 5 7 12l7 7M8 12h10"/>',
    library: '<path d="M3.5 7.5h6l1.8 2H20v8.8a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2Z"/><path d="M3.5 7.5V5.7a2 2 0 0 1 2-2h4.2l1.8 2H18a2 2 0 0 1 2 2v1.8"/>',
    expand: '<path d="M8.5 3.5H3.5v5M3.5 3.5l6 6M15.5 3.5h5v5M20.5 3.5l-6 6M8.5 20.5h-5v-5M3.5 20.5l6-6M15.5 20.5h5v-5M20.5 20.5l-6-6"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    manage: '<path d="M5 7h14M5 12h14M5 17h14"/><circle cx="4" cy="7" r=".7" fill="currentColor"/><circle cx="4" cy="12" r=".7" fill="currentColor"/><circle cx="4" cy="17" r=".7" fill="currentColor"/>',
    tasks: '<path d="m4 6 1.7 1.7L8.5 4.8M10.5 6H20M4 12l1.7 1.7 2.8-2.9M10.5 12H20M4 18l1.7 1.7 2.8-2.9M10.5 18H20"/>',
    more: '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
});

export function toolbarIcon(name) {
    const path = paths[name];
    if (!path) return '';
    return `<svg class="rmt-toolbar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
