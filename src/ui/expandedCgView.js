import * as targets from '../core/cgTargets.js';
import * as images from '../generation/imageGeneration.js';
import * as editor from './cgPromptEditor.js';
import * as viewer from './cgImageViewer.js';
import * as text from '../core/text.js';
import * as state from '../core/state.js';

export function expandedCgHtml(session, input, readOnly = false) {
    const descriptor = targets.describeExpandedCgTarget(session, input);
    const resolved = descriptor && targets.expandedCgItem(session, descriptor);
    if (!resolved) return '';
    const saved = images.normalizeCgImageRecord(resolved.item.cgImage);
    const attrs = `data-rmt-expanded-cg="${text.esc(JSON.stringify(descriptor))}"`;
    return `<section class="rmt-expanded-cg">${saved ? `<div class="rmt-thumb">${images.cgImageLayerHtml(resolved.item)}</div>` : ''}<div class="rmt-cg-card-actions">${saved ? `<button type="button" class="rmt-btn" ${attrs} data-rmt-expanded-cg-view="1">查看已保存图片</button>` : ''}${readOnly ? '' : `<button type="button" class="rmt-btn" ${attrs}>${saved ? '编辑画面 / 再画一张' : '设置画面并预览生图'}</button>`}</div></section>`;
}

export function handleExpandedCgButton(button) {
    if (!button || button.disabled) return false;
    let descriptor;
    try { descriptor = JSON.parse(button.dataset.rmtExpandedCg); } catch { return false; }
    const resolved = targets.expandedCgItem(state.state.activeSession, descriptor);
    if (!resolved) return false;
    if (button.dataset.rmtExpandedCgView === '1') return viewer.openCgImageViewer(resolved.item.cgImage, resolved.item.title, { opener: button });
    if (state.state.activeArchiveSnapshot) return false;
    return editor.openCgPromptEditor({ targetDescriptor: descriptor });
}
