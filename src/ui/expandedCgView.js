import * as targets from '../core/cgTargets.js';
import * as images from '../generation/imageGeneration.js';
import * as editor from './cgPromptEditor.js';
import * as viewer from './cgImageViewer.js';
import * as text from '../core/text.js';
import * as state from '../core/state.js';

export function previousExpandedImagesHtml(session, descriptor) {
    const collection = descriptor.kind === 'heart-voice' ? session?.voiceDramas
        : descriptor.kind === 'heart-scenario' ? session?.scenarioDramas
        : descriptor.kind === 'ending-confession' ? session?.confessionReplays
        : descriptor.kind === 'ending-ending' ? session?.endings : [];
    const owner = (collection || []).find(item => item.id === descriptor.containerId);
    const pictures = [];
    for (const visual of owner?.previousCgVisuals || []) for (const candidate of [visual.cgImage, ...(visual.cgImageHistory || [])]) {
        const picture = images.normalizeCgImageRecord(candidate);
        if (picture && !pictures.some(saved => saved.url === picture.url)) pictures.push(picture);
    }
    if (!pictures.length) return '';
    return '<details class="rmt-cg-previous-scenes"><summary>先前内容的图片（' + pictures.length + '）</summary>' + pictures.map(picture => '<img loading="lazy" style="max-width:100%;height:auto" src="' + text.esc(picture.url) + '" alt="先前内容的已保存图片">').join('') + '</details>';
}

// savedOnly：只在已经存过图片时才显示（用于已停用的整篇入口，避免旧图凭空消失）。
export function expandedCgHtml(session, input, readOnly = false, { savedOnly = false, showImage = true, placeholder = '' } = {}) {
    const descriptor = targets.describeExpandedCgTarget(session, input);
    const resolved = descriptor && targets.expandedCgItem(session, descriptor);
    if (!resolved) return '';
    const saved = images.normalizeCgImageRecord(resolved.item.cgImage);
    if (savedOnly && !saved) return '';
    const attrs = `data-rmt-expanded-cg="${text.esc(JSON.stringify(descriptor))}"`;
    return `<section class="rmt-expanded-cg">${saved && showImage ? `<div class="rmt-thumb">${images.cgImageLayerHtml(resolved.item)}</div>` : !saved ? placeholder : ''}<div class="rmt-cg-card-actions">${saved ? `<button type="button" class="rmt-btn" ${attrs} data-rmt-expanded-cg-view="1">查看已保存图片</button>` : ''}${readOnly ? '' : `<button type="button" class="rmt-btn" ${attrs}>${saved ? '编辑画面 / 再画一张' : '设置画面并预览生图'}</button>`}</div>${previousExpandedImagesHtml(session, descriptor)}</section>`;
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

// Place a saved habitat picture under its existing interactive light points.
export function expandedCgBackdropHtml(session, input) {
    const descriptor = targets.describeExpandedCgTarget(session, input);
    const resolved = descriptor && targets.expandedCgItem(session, descriptor);
    if (!resolved || !images.normalizeCgImageRecord(resolved.item.cgImage)) return '';
    return `<div class="rmt-cg-backdrop" style="position:absolute;inset:0;border-radius:inherit;overflow:hidden">${images.cgImageLayerHtml(resolved.item)}</div>`;
}
