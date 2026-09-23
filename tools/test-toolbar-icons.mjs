import assert from 'node:assert/strict';
import { TOOLBAR_ICON_NAMES, toolbarIcon } from '../src/ui/toolbarIcons.js';

for (const name of TOOLBAR_ICON_NAMES) {
    const svg = toolbarIcon(name);
    assert.match(svg, /^<svg\b/);
    assert.match(svg, /aria-hidden="true"/);
    assert.doesNotMatch(svg, /<i\b|https?:|javascript:|onload=|<script/i);
}
assert.equal(toolbarIcon('unknown'), '');
console.log('toolbar-icons-ok');
