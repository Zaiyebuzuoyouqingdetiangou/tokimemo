import { updateLatestVisualSignature } from './storage.js?rmv=1.4.30.12';
import { consumeInjectedFeedbackForSuccessfulRabbitMirror } from './feedbackCat.js?rmv=1.4.30.12';
import { getSettings } from './settings.js?rmv=1.4.30.12';
import {
    captureRabbitMirrorGenerationSnapshots,
    getRabbitMirrorGenerationSnapshot,
    inspectRabbitMirrorGenerationSource,
} from './generationGuard.js?rmv=1.4.30.12';

const TOTO_RE = new RegExp('<toto\\b[^>]*(?:data-rabbit-mirror|data-rabbit-' + 'h' + 'ole)=[\"\']true[\"\'][^>]*>[\\s\\S]*?<\\/toto>', 'i');
let lastScannedHash = '';
let lastScanAttempts = 0;
let visualScannerSubscriptions = [];
let visualScannerTimers = new Set();
let visualScannerCaptureTimer = 0;

function hashText(text) {
    let hash = 0;
    const input = String(text || '');
    for (let i = 0; i < input.length; i += 1) {
        hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return String(hash);
}

function stripTags(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function count(re, text) {
    return (String(text || '').match(re) || []).length;
}

function extractStyleFingerprints(html) {
    const styles = [...String(html || '').matchAll(/<([a-z0-9-]+)\b[^>]*\sstyle=["']([^"']+)["'][^>]*>/gi)];
    const normalized = styles.map(match => {
        const tag = match[1].toLowerCase();
        const props = match[2]
            .toLowerCase()
            .split(';')
            .map(part => part.trim().split(':')[0])
            .filter(Boolean)
            .sort()
            .join('|');
        return `${tag}:${props}`;
    }).filter(Boolean);
    const buckets = new Map();
    for (const item of normalized) buckets.set(item, (buckets.get(item) || 0) + 1);
    const repeated = [...buckets.values()].filter(v => v >= 3).length;
    const maxRepeat = Math.max(0, ...buckets.values());
    return { repeated, maxRepeat };
}

function parseToto(html) {
    try {
        if (typeof DOMParser === 'undefined') return null;
        const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
        const legacyAttr = 'data-rabbit-' + 'h' + 'ole';
        return doc.querySelector(`toto[data-rabbit-mirror="true"], toto[${legacyAttr}="true"]`) || doc.querySelector('toto');
    } catch {
        return null;
    }
}

function elementDepth(el) {
    if (!el || !el.children || !el.children.length) return 0;
    return 1 + Math.max(...[...el.children].map(child => elementDepth(child)));
}

function stylePropSet(el) {
    const style = (el?.getAttribute?.('style') || '').toLowerCase();
    return new Set(style.split(';').map(part => part.trim().split(':')[0]).filter(Boolean));
}

function setOverlapRatio(a, b) {
    if (!a.size && !b.size) return 1;
    let hit = 0;
    for (const item of a) if (b.has(item)) hit += 1;
    return hit / Math.max(1, Math.min(a.size, b.size));
}

function areSimilarBlocks(a, b) {
    if (!a || !b || a.nodeType !== 1 || b.nodeType !== 1) return false;
    const tagClose = a.tagName === b.tagName;
    const childClose = Math.abs(a.children.length - b.children.length) <= 1;
    const depthClose = Math.abs(elementDepth(a) - elementDepth(b)) <= 1;
    const styleClose = setOverlapRatio(stylePropSet(a), stylePropSet(b)) >= 0.45;
    const textA = (a.textContent || '').trim().length;
    const textB = (b.textContent || '').trim().length;
    const textClose = Math.abs(textA - textB) <= Math.max(60, Math.max(textA, textB) * 0.45);
    return tagClose && childClose && depthClose && (styleClose || textClose);
}

function analyzeDomStructure(html) {
    const toto = parseToto(html);
    if (!toto) return { maxSimilarRun: 0, summaryLength: 0, summaryFlags: [] };
    const summary = toto.querySelector('summary');
    const summaryLength = (summary?.textContent || '').replace(/\s+/g, '').length;
    const summaryFlags = [];
    if (summaryLength > 80) summaryFlags.push('summary疑似伪装正文承载区');
    else if (summaryLength > 60) summaryFlags.push('summary标题栏冗长');
    else if (summaryLength > 40) summaryFlags.push('summary标题偏长');

    let maxSimilarRun = 0;
    const containers = [toto, ...[...toto.querySelectorAll('details, div, section, article, main')].slice(0, 80)];
    for (const container of containers) {
        const children = [...container.children].filter(el => !['SUMMARY', 'STYLE', 'SCRIPT'].includes(el.tagName));
        let run = 1;
        for (let i = 1; i < children.length; i += 1) {
            if (areSimilarBlocks(children[i - 1], children[i])) {
                run += 1;
                maxSimilarRun = Math.max(maxSimilarRun, run);
            } else {
                run = 1;
            }
        }
    }
    return { maxSimilarRun, summaryLength, summaryFlags };
}


function textLengthBucket(len) {
    if (len < 60) return 'short';
    if (len < 180) return 'medium';
    return 'long';
}

function blockFeature(el) {
    const style = (el?.getAttribute?.('style') || '').toLowerCase();
    const text = (el?.textContent || '').replace(/\s+/g, '').trim();
    return {
        tag: el?.tagName || '',
        hasBg: /background(?:-color)?\s*:/.test(style),
        hasBorder: /border\s*:/.test(style) || /border-left\s*:/.test(style),
        hasRadius: /border-radius\s*:/.test(style),
        hasShadow: /box-shadow\s*:/.test(style),
        hasPadding: /padding\s*:/.test(style),
        hasHeading: !!el?.querySelector?.('h1,h2,h3,h4,strong,b'),
        childBucket: Math.min(4, el?.children?.length || 0),
        textBucket: textLengthBucket(text.length),
    };
}

function featureSimilarity(a, b) {
    const keys = ['tag', 'hasBg', 'hasBorder', 'hasRadius', 'hasShadow', 'hasPadding', 'hasHeading', 'childBucket', 'textBucket'];
    let same = 0;
    for (const key of keys) {
        if (a?.[key] === b?.[key]) same += 1;
    }
    return same / keys.length;
}

function getBlockCandidates(root) {
    if (!root?.querySelectorAll) return [];
    return [...root.querySelectorAll('div, section, article, li')]
        .filter(el => {
            const text = (el.textContent || '').replace(/\s+/g, '').trim();
            if (text.length < 24) return false;
            const style = (el.getAttribute('style') || '').toLowerCase();
            const hasBoxSignal = /border\s*:|border-left\s*:|border-radius\s*:|background(?:-color)?\s*:|box-shadow\s*:|padding\s*:/.test(style);
            return hasBoxSignal;
        })
        .slice(0, 80);
}

function detectSameBlockStack(root, html = '') {
    const candidates = getBlockCandidates(root);
    if (candidates.length < 3) return false;
    const features = candidates.map(blockFeature);
    let similarPairs = 0;
    let totalPairs = 0;
    for (let i = 0; i < features.length; i += 1) {
        for (let j = i + 1; j < features.length; j += 1) {
            totalPairs += 1;
            if (featureSimilarity(features[i], features[j]) >= 0.72) similarPairs += 1;
        }
    }
    const similarRatio = totalPairs ? similarPairs / totalPairs : 0;
    const htmlText = String(html || '').toLowerCase();
    const verticalStackSignal = /flex-direction\s*:\s*column|gap\s*:|margin-bottom\s*:|<h[1-4]\b/i.test(htmlText);
    const repeatedBoxSignal = count(/border-radius\s*:/gi, htmlText) >= 3 || count(/border\s*:/gi, htmlText) >= 3 || count(/background(?:-color)?\s*:/gi, htmlText) >= 4;
    return candidates.length >= 4 && repeatedBoxSignal && (verticalStackSignal || similarRatio >= 0.55) && similarRatio >= 0.38;
}

function candidateSimilarityRatio(candidates = []) {
    if (!Array.isArray(candidates) || candidates.length < 2) return 0;
    const features = candidates.map(blockFeature);
    let similarPairs = 0;
    let totalPairs = 0;
    for (let i = 0; i < features.length; i += 1) {
        for (let j = i + 1; j < features.length; j += 1) {
            totalPairs += 1;
            if (featureSimilarity(features[i], features[j]) >= 0.68) similarPairs += 1;
        }
    }
    return totalPairs ? similarPairs / totalPairs : 0;
}

function detectSameGridCardRisk(root, html = '') {
    const text = String(html || '').toLowerCase();
    const gridSignal = /display\s*:\s*grid|grid-template|grid-template-columns|repeat\s*\(/i.test(text);
    if (!gridSignal) return false;
    const candidates = getBlockCandidates(root);
    if (candidates.length < 4) return false;
    const ratio = candidateSimilarityRatio(candidates);
    const boxSignals = count(/border\s*:/gi, text) + count(/border-radius\s*:/gi, text) + count(/background(?:-color)?\s*:/gi, text);
    return ratio >= 0.30 && boxSignals >= 8;
}

function detectCatalogPageRisk(root, html = '', plain = '') {
    const text = `${html || ''}\n${plain || ''}`;
    const catalogSignal = /图鉴|目录|标本|物件|编号|条目|清单|列表|收藏|catalog|index|specimen|item|collection/i.test(text);
    if (!catalogSignal) return false;
    const candidates = getBlockCandidates(root);
    const gridSignal = /display\s*:\s*grid|grid-template|grid-template-columns|repeat\s*\(/i.test(String(html || ''));
    return candidates.length >= 4 && (gridSignal || candidateSimilarityRatio(candidates) >= 0.30);
}

function detectVisualPromiseWithoutMechanism(html = '', plain = '') {
    const text = `${html || ''}\n${plain || ''}`;
    const promisesMotion = /运动|变化|推进|实时|动态|连续|滚动|轮播|闪烁|流动|播放|抽取中|倒计时|漂浮|旋转|震动|呼吸|脉冲|弹幕/i.test(text);
    if (!promisesMotion) return false;
    const hasMechanism = /animation\s*:|@keyframes|transition\s*:|transform\s*:|<svg\b|<animate\b|<marquee\b|stroke-dasharray|offset-path/i.test(String(html || ''));
    return !hasMechanism;
}


function hasMeaningfulStateRule(html = '', statePseudo = ':checked') {
    const styles = [...String(html || '').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
        .map(match => match[1])
        .join('\n');
    if (!styles || !styles.toLowerCase().includes(statePseudo.toLowerCase())) return false;
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = ruleRe.exec(styles))) {
        const selector = String(match[1] || '');
        if (!selector.toLowerCase().includes(statePseudo.toLowerCase())) continue;
        const declarations = String(match[2] || '')
            .split(';')
            .map(part => part.trim())
            .filter(Boolean)
            .map(part => {
                const colon = part.indexOf(':');
                if (colon < 0) return null;
                return {
                    property: part.slice(0, colon).trim().toLowerCase(),
                    value: part.slice(colon + 1).trim().toLowerCase(),
                };
            })
            .filter(Boolean);
        if (!declarations.length) continue;
        const cosmeticOnly = declarations.every(({ property, value }) => {
            if (property.startsWith('--')) return true;
            if (property === 'transform') {
                // 3D 翻面可改变正反面内容；普通位移/缩放只算选中反馈。
                return !/(?:rotate[xy]|perspective)\s*\(/i.test(value);
            }
            return property === 'color'
                || property === 'background' || property.startsWith('background-')
                || property === 'border' || property.startsWith('border-')
                || property === 'box-shadow' || property === 'text-shadow'
                || property === 'outline' || property.startsWith('outline-')
                || property === 'fill' || property === 'stroke'
                || property === 'filter' || property === 'backdrop-filter'
                || property === 'cursor'
                || property === 'font-weight' || property === 'font-style'
                || property === 'text-decoration' || property === 'letter-spacing'
                || property === 'translate' || property === 'rotate' || property === 'scale'
                || property === 'transition' || property.startsWith('transition-')
                || property === 'transform-origin';
        });
        if (!cosmeticOnly) return true;
    }
    return false;
}

function detectEffectiveInteraction(html = '') {
    const text = String(html || '');
    const innerDetails = count(/<details\b/gi, text) >= 2 && /<summary\b/i.test(text);
    const hasCheckInput = /<input\b[^>]*type\s*=\s*["']?(?:checkbox|radio)\b/i.test(text);
    const checkedRoute = hasCheckInput && hasMeaningfulStateRule(text, ':checked');
    const targetRoute = /href\s*=\s*["']#[^"']+["']/i.test(text) && hasMeaningfulStateRule(text, ':target');
    const popoverRoute = /\bpopovertarget\s*=|\bcommandfor\s*=/i.test(text) && /\bpopover(?:\s|=|>)/i.test(text);
    return innerDetails || checkedRoute || targetRoute || popoverRoute;
}

function detectInteractionSignals(html = '', plain = '') {
    const text = `${html || ''}\n${plain || ''}`;
    return /:hover|:active|:focus|transition\s*:|cursor\s*:\s*pointer|<button\b|<label\b|点击|选择|切换|开关|解锁|探索|查看|操作|按钮/i.test(text);
}

function interactionFamilyRecord(id = 'none', label = '未识别交互家族', confidence = 0, details = {}) {
    return {
        id: String(id || 'none'),
        label: String(label || '未识别交互家族'),
        confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
        controlCount: Math.max(0, Number(details.controlCount) || 0),
        panelCount: Math.max(0, Number(details.panelCount) || 0),
    };
}

function labelsForControls(root, controls = []) {
    if (!root?.querySelectorAll || !controls.length) return [];
    const labels = new Set();
    for (const control of controls) {
        const id = String(control?.id || '').trim();
        if (id) {
            try {
                root.querySelectorAll(`label[for="${globalThis.CSS?.escape ? globalThis.CSS.escape(id) : id.replace(/["\\]/g, '\\$&')}"]`).forEach(label => labels.add(label));
            } catch {
                root.querySelectorAll('label').forEach(label => {
                    if (String(label.getAttribute('for') || '') === id) labels.add(label);
                });
            }
        }
        const parentLabel = control?.closest?.('label');
        if (parentLabel) labels.add(parentLabel);
    }
    return [...labels];
}

function detectInteractionFamily(root, html = '') {
    const text = String(html || '');
    const lower = text.toLowerCase();
    const innerDetailsCount = Math.max(0, count(/<details\b/gi, text) - 1);
    const rotateFlip = /rotate[xy]\s*\(\s*(?:-?180|180deg)/i.test(text)
        && /backface-visibility|transform-style\s*:\s*preserve-3d|perspective\s*:/i.test(text);
    if (rotateFlip) return interactionFamilyRecord('flip_card_family', '翻面／双面切换', 0.96, { controlCount: count(/<input\b/gi, text), panelCount: 2 });

    const controls = root?.querySelectorAll
        ? [...root.querySelectorAll('input[type="radio"], input[type="checkbox"]')]
        : [];
    const radios = controls.filter(input => String(input.type || '').toLowerCase() === 'radio');
    const checkboxes = controls.filter(input => String(input.type || '').toLowerCase() === 'checkbox');
    const checkedRules = count(/:checked\b/gi, text);

    const groups = new Map();
    for (const radio of radios) {
        const key = String(radio.getAttribute('name') || '').trim() || `__ungrouped__:${radio.id || groups.size}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(radio);
    }
    const largestRadioGroup = [...groups.values()].sort((a, b) => b.length - a.length)[0] || [];
    const groupLabels = labelsForControls(root, largestRadioGroup);
    const sameLayerPanelSignal = /grid-area\s*:\s*1\s*\/\s*1|position\s*:\s*absolute[\s\S]{0,220}(?:opacity\s*:\s*0|visibility\s*:\s*hidden)/i.test(lower);
    const tabLanguageSignal = /tab|tabs|panel|pane|频道|标签页|选项卡|结局\s*0?1|档位|模式\s*[一二三123]/i.test(`${lower} ${stripTags(text)}`);
    if (largestRadioGroup.length >= 3 && groupLabels.length >= 3 && checkedRules >= 3) {
        return interactionFamilyRecord('tabbed_radio_family', '并列标签／多按钮切页', sameLayerPanelSignal || tabLanguageSignal ? 0.99 : 0.94, {
            controlCount: largestRadioGroup.length,
            panelCount: Math.max(largestRadioGroup.length, checkedRules),
        });
    }
    if (largestRadioGroup.length >= 2 && groupLabels.length >= 2 && checkedRules >= 2 && (sameLayerPanelSignal || tabLanguageSignal)) {
        return interactionFamilyRecord('tabbed_radio_family', '并列标签／多按钮切页', 0.92, {
            controlCount: largestRadioGroup.length,
            panelCount: Math.max(largestRadioGroup.length, checkedRules),
        });
    }
    if (controls.length >= 3 && labelsForControls(root, controls).length >= 3 && checkedRules >= 2) {
        return interactionFamilyRecord('multi_control_panel_family', '多控件状态面板', 0.86, {
            controlCount: controls.length,
            panelCount: checkedRules,
        });
    }
    if (checkboxes.length === 1 && checkedRules >= 1) {
        return interactionFamilyRecord('checkbox_reveal_family', '单入口揭示／展开', 0.90, { controlCount: 1, panelCount: 1 });
    }
    if (checkboxes.length >= 2 && checkedRules >= 2) {
        return interactionFamilyRecord('multi_checkbox_family', '多点揭示／清单状态', 0.84, { controlCount: checkboxes.length, panelCount: checkedRules });
    }
    if (innerDetailsCount >= 1) {
        return interactionFamilyRecord('inner_details_family', '内部折叠／分层阅读', 0.88, { controlCount: innerDetailsCount, panelCount: innerDetailsCount });
    }
    if (/href\s*=\s*["']#[^"']+["']/i.test(text) && /:target\b/i.test(text)) {
        return interactionFamilyRecord('target_navigation_family', '锚点／目标状态切换', 0.86, { controlCount: count(/href\s*=\s*["']#/gi, text), panelCount: count(/:target\b/gi, text) });
    }
    if (/\bpopovertarget\s*=|\bcommandfor\s*=/i.test(text)) {
        return interactionFamilyRecord('popover_family', '弹层／局部浮出', 0.88, { controlCount: count(/popovertarget|commandfor/gi, text), panelCount: count(/\bpopover(?:\s|=|>)/gi, text) });
    }
    if (detectEffectiveInteraction(text)) {
        return interactionFamilyRecord('css_state_family', '其他 CSS 状态交互', 0.58, { controlCount: controls.length, panelCount: checkedRules });
    }
    return interactionFamilyRecord();
}

function detectInteractionMissing(html = '') {
    return !detectEffectiveInteraction(html);
}

function detectFakeInteraction(html = '', plain = '') {
    return !detectEffectiveInteraction(html) && detectInteractionSignals(html, plain);
}

function detectWeakSpatialComplexity(html = '', plain = '') {
    const text = String(html || '');
    const spatialSignals = count(/position\s*:\s*absolute|display\s*:\s*grid|grid-template|grid-area|transform\s*:|clip-path\s*:|mask\s*:|z-index\s*:|<svg\b|<path\b|radial-gradient|conic-gradient|repeating-gradient|aspect-ratio/gi, text);
    const visualSignals = count(/box-shadow\s*:|linear-gradient|radial-gradient|filter\s*:|backdrop-filter|clip-path|mask\s*:|transform\s*:|<svg\b/gi, text);
    const textHeavy = String(plain || '').length > 520;
    return textHeavy && spatialSignals < 2 && visualSignals < 3;
}

function detectFlatVerticalFlow(html = '', root = null) {
    const text = String(html || '');
    const columnSignals = count(/flex-direction\s*:\s*column|margin-bottom\s*:|<br\s*\/?>(?![^<]*<svg)|<li\b/gi, text);
    const divs = count(/<div\b/gi, text);
    const absolute = /position\s*:\s*absolute|display\s*:\s*grid|grid-template|clip-path\s*:|mask\s*:|<svg\b/i.test(text);
    const candidates = root ? getBlockCandidates(root) : [];
    const ratio = candidateSimilarityRatio(candidates);
    return divs >= 8 && columnSignals >= 2 && !absolute && (candidates.length >= 3 || ratio >= 0.25);
}

function detectRepeatedUnitShape(root, html = '') {
    const candidates = root ? getBlockCandidates(root) : [];
    if (candidates.length < 3) return false;
    const ratio = candidateSimilarityRatio(candidates);
    const text = String(html || '');
    const repeatedVisualProps = count(/border-radius\s*:|padding\s*:|background(?:-color)?\s*:|border\s*:/gi, text);
    return ratio >= 0.42 && repeatedVisualProps >= 8;
}



function visualSceneryAuditExpected(html = '') {
    if (/data-rm-visual-scenery\s*=\s*["']true["']/i.test(String(html || ''))) return true;
    try { return !!getSettings()?.forceVisualScenery; } catch { return false; }
}

function inspectVisualSceneryMotion(html = '', spatialSignalCount = 0) {
    const text = String(html || '');
    if (!visualSceneryAuditExpected(text)) return [];
    const flags = [];
    const hasMarker = /data-rm-visual-scenery\s*=\s*["']true["']/i.test(text);
    const keyframeCount = count(/@(?:-webkit-)?keyframes\b/gi, text);
    const animationDeclarationCount = count(/(?:^|[;{])\s*(?:-webkit-)?animation(?:-name)?\s*:/gi, text);
    const infiniteCount = count(/\binfinite\b/gi, text);
    const meaningfulKeyframeMotion = /@(?:-webkit-)?keyframes[\s\S]{0,2400}?(?:translate(?:3d|x|y)?\s*\(|rotate(?:3d|x|y)?\s*\(|scale(?:3d|x|y)?\s*\(|clip-path\s*:|mask(?:-position|-size)?\s*:|background-position\s*:|stroke-dashoffset\s*:|offset-distance\s*:)/i.test(text);
    const layeredSceneSignals = count(/position\s*:\s*absolute|z-index\s*:|grid-area\s*:|clip-path\s*:|mask\s*:|radial-gradient|linear-gradient|<svg\b/gi, text);

    if (!hasMarker) flags.push('visual_scenery_marker_missing');
    if (keyframeCount < 1 || animationDeclarationCount < 1 || infiniteCount < 1 || !meaningfulKeyframeMotion) {
        flags.push('weak_visual_scenery_motion');
    }
    if (animationDeclarationCount < 2 || spatialSignalCount < 3 || layeredSceneSignals < 4) {
        flags.push('weak_visual_scenery_layers');
    }
    return flags;
}

function detectRiskFlags({ root, html, plain, dom, repeated, spatialSignalCount }) {
    const flags = [];
    const sameBlockStack = detectSameBlockStack(root, html);
    const sameGridCard = detectSameGridCardRisk(root, html);
    const catalogPage = detectCatalogPageRisk(root, html, plain);

    const flatVerticalFlow = detectFlatVerticalFlow(html, root);
    const repeatedUnitShape = detectRepeatedUnitShape(root, html);
    const weakSpatialComplexity = detectWeakSpatialComplexity(html, plain);
    const interactionMissing = detectInteractionMissing(html);
    const fakeInteraction = detectFakeInteraction(html, plain);
    if (sameBlockStack) flags.push('same_block_stack');
    if (sameGridCard) flags.push('same_grid_card_risk');
    if (catalogPage) flags.push('catalog_page_risk');
    if (flatVerticalFlow) flags.push('flat_vertical_flow');
    if (repeatedUnitShape) flags.push('repeated_unit_shape');

    if (sameBlockStack || sameGridCard || catalogPage || flatVerticalFlow || repeatedUnitShape || (dom?.maxSimilarRun || 0) >= 3 || (repeated?.maxRepeat || 0) >= 4) flags.push('info_page_degrade');
    if (spatialSignalCount < 2 && String(plain || '').length > 520 && (sameBlockStack || sameGridCard || catalogPage || repeatedUnitShape || (repeated?.maxRepeat || 0) >= 3)) flags.push('weak_media_body');
    if (weakSpatialComplexity) flags.push('weak_spatial_complexity');
    if (interactionMissing) flags.push('missing_interaction');
    if (fakeInteraction) flags.push('fake_interaction');
    if (detectVisualPromiseWithoutMechanism(html, plain)) flags.push('visual_promise_unfulfilled');
    flags.push(...inspectVisualSceneryMotion(html, spatialSignalCount));
    return [...new Set(flags)];
}



function expandHexColor(hex) {
    const raw = String(hex || '').replace('#', '').trim();
    if (/^[0-9a-f]{3}$/i.test(raw)) {
        return raw.split('').map(x => x + x).join('');
    }
    if (/^[0-9a-f]{6}$/i.test(raw)) return raw;
    return '';
}

function luminanceFromRgb(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorValueLuminance(value) {
    const v = String(value || '').toLowerCase();
    if (/\bblack\b/.test(v)) return 0;
    if (/\bwhite\b/.test(v)) return 255;
    const rgba = v.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)/);
    if (rgba) {
        const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
        if (!Number.isNaN(alpha) && alpha < 0.25) return null;
        return luminanceFromRgb(Number(rgba[1]), Number(rgba[2]), Number(rgba[3]));
    }
    const hexes = [...v.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)]
        .map(m => expandHexColor(m[1]))
        .filter(Boolean);
    if (hexes.length) {
        const values = hexes.map(hex => {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            return luminanceFromRgb(r, g, b);
        });
        // For gradients, average the first two stops; for flat color, use the first.
        const sample = values.slice(0, Math.min(2, values.length));
        return sample.reduce((a, b) => a + b, 0) / sample.length;
    }
    return null;
}

function extractBackgroundValues(html) {
    const values = [];
    const input = String(html || '');
    const re = /background(?:-color)?\s*:\s*([^;"']+)/gi;
    let match;
    while ((match = re.exec(input))) {
        const value = String(match[1] || '').trim();
        if (value) values.push(value);
    }
    return values;
}

function detectBaseColor(html) {
    const values = extractBackgroundValues(html);
    const luminances = values.map(colorValueLuminance).filter(v => typeof v === 'number' && !Number.isNaN(v));

    // The first explicit background usually belongs to the main container. Give it priority
    // so a dark outer shell cannot be mislabelled as white because of light inner cards.
    if (luminances.length) {
        const first = luminances[0];
        if (first < 90) return '暗色高对比底盘';
        if (first > 190) return '浅色纸面/白底底盘';
        const darkCount = luminances.filter(v => v < 90).length;
        const lightCount = luminances.filter(v => v > 190).length;
        if (darkCount > lightCount) return '暗色高对比底盘';
        if (lightCount > darkCount) return '浅色纸面/白底底盘';
    }

    if (/radial-gradient|conic-gradient|linear-gradient/i.test(html)) return '渐变/混合色底盘';
    return '中性或混合底盘';
}

function detectContrastFamily(html) {
    const values = extractBackgroundValues(html);
    const luminances = values.map(colorValueLuminance).filter(v => typeof v === 'number' && !Number.isNaN(v));
    if (!luminances.length) return 'contrast: mixed_or_unspecified';
    const first = luminances[0];
    if (first < 90) return 'contrast: dark_weighted';
    if (first > 190) return 'contrast: light_weighted';
    return 'contrast: mid_tone_or_mixed';
}


const NAMED_PALETTE_COLORS = Object.freeze({
    black: [0, 0, 0], white: [255, 255, 255], gray: [128, 128, 128], grey: [128, 128, 128],
    red: [255, 0, 0], orange: [255, 165, 0], yellow: [255, 255, 0], green: [0, 128, 0],
    cyan: [0, 255, 255], aqua: [0, 255, 255], blue: [0, 0, 255], navy: [0, 0, 128],
    purple: [128, 0, 128], violet: [238, 130, 238], magenta: [255, 0, 255], pink: [255, 192, 203],
    brown: [165, 42, 42], beige: [245, 245, 220], ivory: [255, 255, 240], teal: [0, 128, 128],
});

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function hslToRgb(h, s, l) {
    const hue = ((Number(h) % 360) + 360) % 360 / 360;
    const sat = clamp(Number(s), 0, 1);
    const light = clamp(Number(l), 0, 1);
    if (sat === 0) {
        const gray = Math.round(light * 255);
        return [gray, gray, gray];
    }
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
    const p = 2 * light - q;
    const hue2rgb = (t) => {
        let x = t;
        if (x < 0) x += 1;
        if (x > 1) x -= 1;
        if (x < 1 / 6) return p + (q - p) * 6 * x;
        if (x < 1 / 2) return q;
        if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
        return p;
    };
    return [hue2rgb(hue + 1 / 3), hue2rgb(hue), hue2rgb(hue - 1 / 3)].map(x => Math.round(x * 255));
}

function rgbToHsl(r, g, b) {
    const rr = clamp(Number(r), 0, 255) / 255;
    const gg = clamp(Number(g), 0, 255) / 255;
    const bb = clamp(Number(b), 0, 255) / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const delta = max - min;
    let h = 0;
    if (delta) {
        if (max === rr) h = 60 * (((gg - bb) / delta) % 6);
        else if (max === gg) h = 60 * (((bb - rr) / delta) + 2);
        else h = 60 * (((rr - gg) / delta) + 4);
    }
    if (h < 0) h += 360;
    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    return { h, s, l };
}

function parseCssColorToken(token) {
    const value = String(token || '').trim().toLowerCase();
    if (!value || value === 'transparent') return null;

    const hex = value.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
        let raw = hex[1];
        if (raw.length === 3 || raw.length === 4) raw = raw.split('').map(char => char + char).join('');
        if (raw.length !== 6 && raw.length !== 8) return null;
        const r = parseInt(raw.slice(0, 2), 16);
        const g = parseInt(raw.slice(2, 4), 16);
        const b = parseInt(raw.slice(4, 6), 16);
        const a = raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1;
        return { r, g, b, a };
    }

    const rgb = value.match(/^rgba?\(\s*([+-]?[0-9.]+)%?\s*[, ]\s*([+-]?[0-9.]+)%?\s*[, ]\s*([+-]?[0-9.]+)%?(?:\s*[,/]\s*([0-9.]+)%?)?\s*\)$/i);
    if (rgb) {
        const isPercent = /%/.test(value.split(/[,)\/]/).slice(0, 3).join(''));
        const factor = isPercent ? 2.55 : 1;
        const alphaRaw = rgb[4] === undefined ? 1 : Number(rgb[4]);
        const alpha = rgb[4] !== undefined && value.includes(`${rgb[4]}%`) ? alphaRaw / 100 : alphaRaw;
        return {
            r: clamp(Number(rgb[1]) * factor, 0, 255),
            g: clamp(Number(rgb[2]) * factor, 0, 255),
            b: clamp(Number(rgb[3]) * factor, 0, 255),
            a: clamp(Number.isFinite(alpha) ? alpha : 1, 0, 1),
        };
    }

    const hsl = value.match(/^hsla?\(\s*([+-]?[0-9.]+)(?:deg)?\s*[, ]\s*([0-9.]+)%\s*[, ]\s*([0-9.]+)%(?:\s*[,/]\s*([0-9.]+)%?)?\s*\)$/i);
    if (hsl) {
        const [r, g, b] = hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
        const alphaRaw = hsl[4] === undefined ? 1 : Number(hsl[4]);
        const alpha = hsl[4] !== undefined && value.includes(`${hsl[4]}%`) ? alphaRaw / 100 : alphaRaw;
        return { r, g, b, a: clamp(Number.isFinite(alpha) ? alpha : 1, 0, 1) };
    }

    if (NAMED_PALETTE_COLORS[value]) {
        const [r, g, b] = NAMED_PALETTE_COLORS[value];
        return { r, g, b, a: 1 };
    }
    return null;
}

function extractCssColors(value) {
    const input = String(value || '').toLowerCase();
    if (!input || input === 'none' || input === 'transparent') return [];
    const tokenRe = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:black|white|gray|grey|red|orange|yellow|green|cyan|aqua|blue|navy|purple|violet|magenta|pink|brown|beige|ivory|teal)\b/gi;
    return [...input.matchAll(tokenRe)]
        .map(match => parseCssColorToken(match[0]))
        .filter(color => color && color.a >= 0.08);
}

function hueFamilyOf(hue) {
    const h = ((Number(hue) % 360) + 360) % 360;
    if (h < 15 || h >= 345) return 'red';
    if (h < 45) return 'orange';
    if (h < 70) return 'yellow';
    if (h < 165) return 'green';
    if (h < 200) return 'cyan';
    if (h < 250) return 'blue';
    if (h < 290) return 'purple';
    return 'pink';
}

function classifyPaletteSamples(samples, source = 'raw', mainBackgroundFound = false) {
    const usable = (samples || []).filter(sample => sample?.color && Number(sample.weight) > 0);
    if (!usable.length) return null;
    let totalWeight = 0;
    let luminanceSum = 0;
    let saturationSum = 0;
    let darkWeight = 0;
    let lightWeight = 0;
    let chromaticWeight = 0;
    let warmWeight = 0;
    let coolWeight = 0;
    const hueWeights = new Map();

    for (const sample of usable) {
        const color = sample.color;
        const alpha = clamp(Number(color.a ?? 1), 0, 1);
        const weight = Number(sample.weight) * Math.max(0.12, alpha);
        if (!Number.isFinite(weight) || weight <= 0) continue;
        const lum = luminanceFromRgb(color.r, color.g, color.b);
        const hsl = rgbToHsl(color.r, color.g, color.b);
        totalWeight += weight;
        luminanceSum += lum * weight;
        saturationSum += hsl.s * weight;
        if (lum < 105) darkWeight += weight;
        if (lum > 185) lightWeight += weight;
        if (hsl.s >= 0.12) {
            const chroma = weight * Math.max(0.25, hsl.s);
            const family = hueFamilyOf(hsl.h);
            chromaticWeight += chroma;
            hueWeights.set(family, (hueWeights.get(family) || 0) + chroma);
            if (['red', 'orange', 'yellow', 'pink'].includes(family)) warmWeight += chroma;
            else if (['green', 'cyan', 'blue', 'purple'].includes(family)) coolWeight += chroma;
        }
    }
    if (!totalWeight) return null;

    const averageLuminance = luminanceSum / totalWeight;
    const darkAreaRatio = darkWeight / totalWeight;
    const lightAreaRatio = lightWeight / totalWeight;
    const averageSaturation = saturationSum / totalWeight;
    const brightness = darkAreaRatio >= 0.55 || averageLuminance < 102
        ? 'dark'
        : (lightAreaRatio >= 0.55 || averageLuminance > 184 ? 'light' : 'mid');

    let hueFamily = 'neutral';
    if (chromaticWeight >= totalWeight * 0.12 && hueWeights.size) {
        hueFamily = [...hueWeights.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    const saturation = averageSaturation < 0.26 ? 'low' : (averageSaturation < 0.56 ? 'medium' : 'high');
    const temperature = warmWeight > coolWeight * 1.2
        ? 'warm'
        : (coolWeight > warmWeight * 1.2 ? 'cool' : 'neutral');
    const baseConfidence = source === 'rendered' ? 0.58 : 0.38;
    const confidence = clamp(baseConfidence + Math.min(0.22, usable.length * 0.025) + (mainBackgroundFound ? 0.14 : 0), 0, 0.96);

    return {
        brightness,
        hueFamily,
        saturation,
        temperature,
        darkAreaRatio: Number(darkAreaRatio.toFixed(2)),
        lightAreaRatio: Number(lightAreaRatio.toFixed(2)),
        averageLuminance: Math.round(averageLuminance),
        confidence: Number(confidence.toFixed(2)),
        source,
    };
}

function findRenderedPaletteRoot(toto) {
    if (!toto?.querySelector) return toto || null;
    const outerDetails = [...(toto.children || [])].find(child => child?.tagName === 'DETAILS') || toto.querySelector('details');
    if (!outerDetails) return toto;
    const directBody = [...(outerDetails.children || [])].find(child => !['SUMMARY', 'STYLE', 'SCRIPT'].includes(child?.tagName));
    return directBody || outerDetails;
}

function elementArea(element) {
    try {
        const rect = element?.getBoundingClientRect?.();
        if (!rect) return 0;
        return Math.max(0, Number(rect.width) || 0) * Math.max(0, Number(rect.height) || 0);
    } catch {
        return 0;
    }
}

function renderedPaletteFingerprint(toto) {
    const root = findRenderedPaletteRoot(toto);
    if (!root?.querySelectorAll) return null;
    const view = root.ownerDocument?.defaultView || globalThis;
    const getStyle = view?.getComputedStyle?.bind(view) || globalThis.getComputedStyle?.bind(globalThis);
    if (typeof getStyle !== 'function') return null;

    const rootArea = Math.max(1, elementArea(root));
    const candidates = [root, ...root.querySelectorAll('div,section,article,main,aside,label,li,figure,svg')]
        .map((element, index) => ({ element, index, area: elementArea(element) }))
        .filter(item => item.index === 0 || item.area >= Math.max(64, rootArea * 0.015))
        .sort((a, b) => b.area - a.area)
        .slice(0, 28);

    const samples = [];
    let mainBackgroundFound = false;
    for (const item of candidates) {
        let style;
        try {
            style = getStyle(item.element);
        } catch {
            continue;
        }
        if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) < 0.05) continue;
        const colors = [
            ...extractCssColors(style.backgroundColor),
            ...extractCssColors(style.backgroundImage),
        ];
        if (!colors.length) continue;
        const isRoot = item.element === root;
        if (isRoot) mainBackgroundFound = true;
        const area = item.area || rootArea * 0.08;
        const baseWeight = isRoot ? rootArea * 2.2 : Math.min(area, rootArea * 0.48);
        const colorWeight = baseWeight / colors.length;
        colors.forEach(color => samples.push({ color, weight: colorWeight }));
    }
    return classifyPaletteSamples(samples, 'rendered', mainBackgroundFound);
}

function rawPaletteFingerprint(html) {
    const values = extractBackgroundValues(html);
    const samples = [];
    values.slice(0, 24).forEach((value, index) => {
        const colors = extractCssColors(value);
        const baseWeight = index === 0 ? 5 : (index < 5 ? 1.5 : 0.7);
        colors.forEach(color => samples.push({ color, weight: baseWeight / Math.max(1, colors.length) }));
    });
    return classifyPaletteSamples(samples, 'raw', values.length > 0);
}

function detectPaletteFingerprint(html, renderedToto = null) {
    return renderedPaletteFingerprint(renderedToto) || rawPaletteFingerprint(html);
}

function detectSurfaceFamily(html, plain = '') {
    const text = `${html || ''}\n${plain || ''}`.toLowerCase();
    const base = detectBaseColor(html);
    if (/纸|信笺|便签|票据|菜单|说明书|羊皮纸|报纸|签文|paper|newspaper|ticket|menu|manual|letter/i.test(text)) return 'surface: paper_or_document_surface';
    if (/玻璃|磨砂|透明|backdrop-filter|blur\(|rgba\([^)]*0\.[0-9]/i.test(text)) return 'surface: glass_or_translucent_surface';
    if (/金属|铁|铜|钢|铝|metal|chrome|silver|bronze/i.test(text)) return 'surface: metallic_or_hard_surface';
    if (/木|布|织物|陶瓷|皮革|石|wood|fabric|ceramic|leather|stone/i.test(text)) return 'surface: physical_material_surface';
    if (/radial-gradient|conic-gradient|linear-gradient|repeating-gradient/i.test(text)) return 'surface: gradient_or_light_surface';
    if (/暗色|黑|夜|neon|霓虹|glow|发光|console|screen|屏幕|控制台|监控/i.test(text) || base.includes('暗色')) return 'surface: digital_dark_surface';
    if (base.includes('浅色')) return 'surface: light_plain_surface';
    return 'surface: mixed_or_unspecified_surface';
}

function detectContourFamily(html, dom) {
    const text = String(html || '');
    if (/clip-path\s*:|polygon\(|path\(|<svg\b|mask\s*:/i.test(text)) return 'contour: cutout_or_irregular_shape';
    if (/border-radius\s*:\s*50%|border-radius\s*:\s*999/i.test(text)) return 'contour: circular_or_pill_shape';
    if (count(/border-radius\s*:/gi, text) >= 4 && count(/<div\b/gi, text) >= 8) return 'contour: rounded_panel_cluster';
    if ((dom?.maxSimilarRun || 0) >= 2) return 'contour: repeated_rectangular_blocks';
    if (/position\s*:\s*absolute|transform\s*:/i.test(text)) return 'contour: layered_freeform_overlay';
    return 'contour: simple_or_mixed_outline';
}

function detectSpaceFamily(html, spatialSignalCount) {
    const text = String(html || '');
    if (spatialSignalCount >= 4) return 'space: layered_depth_or_spatial_scene';
    if (/display\s*:\s*grid|grid-template/i.test(text)) return 'space: grid_plane';
    if (/display\s*:\s*flex/i.test(text)) return 'space: flex_plane';
    if (spatialSignalCount >= 2) return 'space: shallow_layered_surface';
    return 'space: flat_content_surface';
}

function detectLayout(html, dom, spatialSignalCount) {
    const text = String(html || '');
    const grid = /display\s*:\s*grid|grid-template|grid-area/i.test(text);
    const flexColumn = /display\s*:\s*flex;[^"']*flex-direction\s*:\s*column/i.test(text);
    const flexRow = /display\s*:\s*flex/i.test(text) && !flexColumn;
    const absolute = /position\s*:\s*absolute/i.test(text);
    const summary = /<summary\b/i.test(text);
    if (absolute && spatialSignalCount >= 4) return '空间锚点/浮层式布局';
    if (grid) return '网格分区布局';
    if (summary && (dom?.maxSimilarRun || 0) >= 2) return '顶部折叠标题栏 + 多区块堆叠布局';
    if (flexColumn || count(/<div\b/gi, text) >= 10) return '纵向分组堆叠布局';
    if (flexRow) return '横向并列/分栏布局';
    return '自由排版布局';
}

function detectReadingPath(html, spatialSignalCount) {
    const text = String(html || '');
    if (/timeline|left\s*:\s*\d+%|top\s*:\s*\d+%|position\s*:\s*absolute/i.test(text) && spatialSignalCount >= 3) return '按视觉锚点跳读';
    if (/display\s*:\s*grid|grid-template/i.test(text)) return '按网格分区扫描';
    if (/flex-direction\s*:\s*column|<ul\b|<li\b/i.test(text)) return '自上而下分段扫描';
    return '中心内容向外扩散阅读';
}

function detectInfoUnit(html, dom, repeated) {
    const text = String(html || '');
    if (/<table\b|display\s*:\s*table/i.test(text)) return '表格/清单单元';
    if (/position\s*:\s*absolute/i.test(text) && count(/<span\b/gi, text) >= 5) return '浮动碎片/弹幕单元';
    if ((dom?.maxSimilarRun || 0) >= 2 || (repeated?.maxRepeat || 0) >= 3) return '矩形信息块/卡片化条目';
    if (/<li\b/i.test(text)) return '列表条目单元';
    return '段落与装饰节点混合单元';
}

function detectMood(html, plain) {
    const text = `${html || ''}\n${plain || ''}`.toLowerCase();
    const hasArchive = /档案|记录|备忘|日志|检索|搜索|警告|通报|报告|情报|archive|log|memo|record|warning/i.test(text);
    const hasControl = /监控|后台|控制台|直播|弹幕|播放|录像|screen|console|control|live|video/i.test(text);
    const hasPaper = /报纸|新闻|信笺|便签|票据|菜单|说明书|纸|paper|newspaper|menu|ticket|manual/i.test(text);
    const hasNeon = /neon|霓虹|glow|发光|box-shadow|filter\s*:\s*drop-shadow|高饱和/i.test(text);
    if (hasArchive && hasControl) return '档案/后台/监控混合气质';
    if (hasArchive) return '档案/记录/警告气质';
    if (hasControl) return '监控/直播/控制台气质';
    if (hasPaper) return '纸面/印刷物气质';
    if (hasNeon) return '霓虹/发光/电子气质';
    if (/wood|木|铜|金属|玻璃|磨砂|羊皮纸|陶瓷|织物|布/i.test(text)) return '明确材质化媒介气质';
    return '综合情绪化 UI 气质';
}

function buildVisualSkeleton(html, plain, metrics) {
    return [
        `surface_family: ${detectSurfaceFamily(html, plain)}`,
        `contrast_family: ${detectContrastFamily(html)}`,
        `contour_family: ${detectContourFamily(html, metrics.dom)}`,
        `reading_family: ${detectReadingPath(html, metrics.spatialSignalCount)}`,
        `unit_family: ${detectInfoUnit(html, metrics.dom, metrics.repeated)}`,
        `space_family: ${detectSpaceFamily(html, metrics.spatialSignalCount)}`,
        `interaction_family: ${metrics.interactionFamily?.label || '未识别交互家族'}`,
        `mood: ${detectMood(html, plain)}`,
    ].join('；');
}

function detectGlobalCssRisk(html) {
    const styles = [...String(html || '').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
    if (!styles) return false;
    return /(^|[}\s,])(html|body|:root|\*|\.mes|\.message|\.chat|\.content|\.ts-message-container|#chat|#send_form)\s*[{,]/i.test(styles);
}


function detectInnerDetailsUsed(root, html = '') {
    if (root?.querySelectorAll) {
        const outerDetails = root.matches?.('details')
            ? root
            : root.querySelector?.(':scope > details') || root.querySelector?.('details');
        return [...root.querySelectorAll('details')].some(details => details !== outerDetails);
    }
    return (String(html || '').match(/<details\b/gi) || []).length >= 2;
}

export function scanRabbitMirrorHtml(messageHtml, renderedToto = null) {
    const match = String(messageHtml || '').match(TOTO_RE);
    if (!match) return { signature: '', skeleton: '', riskFlags: [], paletteFingerprint: null, interactionFamily: interactionFamilyRecord() };
    const html = match[0];
    const plain = stripTags(html);
    const tagCount = count(/<\w+\b/g, html);
    const divCount = count(/<div\b/gi, html);
    const repeated = extractStyleFingerprints(html);
    const dom = analyzeDomStructure(html);
    const root = parseToto(html);
    const textDensity = plain.length > 900 && tagCount < 65 ? '文本密度过高' : plain.length > 520 ? '文本密度中高' : '文本密度适中';

    const spatialSignalCount = count(/position\s*:\s*absolute|grid-area\s*:|grid-template|display\s*:\s*grid|transform\s*:|clip-path\s*:|mask\s*:|z-index\s*:|<svg\b|<path\b|radial-gradient|conic-gradient|repeating-gradient|aspect-ratio/gi, html);
    const effects = [];
    if (/animation\s*:|@keyframes|<marquee\b|<animate\b/i.test(html)) effects.push('动态效果有');
    else effects.push('动态效果无');
    if (/linear-gradient|radial-gradient|conic-gradient|box-shadow|filter\s*:|backdrop-filter|mix-blend-mode|mask|clip-path/i.test(html)) effects.push('高级CSS有');
    else effects.push('高级CSS弱');
    if (spatialSignalCount >= 4) effects.push('空间构造信号强');
    else if (spatialSignalCount >= 2) effects.push('空间构造信号中');
    else effects.push('空间构造信号弱');

    const structural = [];
    if (dom.maxSimilarRun >= 3) structural.push('连续同构兄弟区块明显/卡片化倾向高');
    else if (dom.maxSimilarRun >= 2) structural.push('存在连续同构兄弟区块');
    if (repeated.maxRepeat >= 4 || repeated.repeated >= 2) structural.push('存在重复同构内容块/卡片化倾向高');
    else if (repeated.maxRepeat >= 3) structural.push('存在重复同构内容块');
    if (/display\s*:\s*flex;[^"']*flex-direction\s*:\s*column/i.test(html) && divCount >= 10) structural.push('纵向分组结构明显');
    if (spatialSignalCount < 2 && plain.length > 520 && (dom.maxSimilarRun >= 2 || repeated.maxRepeat >= 3 || divCount >= 10)) structural.push('主要依赖纵向文本流/媒介轮廓偏弱');
    if (count(/border-radius\s*:/gi, html) >= 4 && count(/padding\s*:/gi, html) >= 6) structural.push('圆角容器密集');
    if (count(/<!--/g, html) > 0) structural.push('HTML注释残留');
    if (/<pre\b|<code\b|```/i.test(html)) structural.push('代码块风险');
    if (detectGlobalCssRisk(html)) structural.push('全局CSS污染风险');
    const riskFlags = detectRiskFlags({ root, html, plain, dom, repeated, spatialSignalCount });
    if (detectInnerDetailsUsed(root, html)) riskFlags.unshift('inner_details_used');
    if (riskFlags.includes('same_block_stack')) structural.push('同构信息块堆叠风险');
    if (riskFlags.includes('same_grid_card_risk')) structural.push('同构网格信息块风险');
    if (riskFlags.includes('catalog_page_risk')) structural.push('图鉴/目录式承载风险');
    if (riskFlags.includes('flat_vertical_flow')) structural.push('单向纵向阅读路径风险');
    if (riskFlags.includes('repeated_unit_shape')) structural.push('重复内容单元形状风险');
    if (riskFlags.includes('info_page_degrade')) structural.push('信息页降级风险');
    if (riskFlags.includes('weak_media_body')) structural.push('媒介本体偏弱风险');
    if (riskFlags.includes('weak_spatial_complexity')) structural.push('空间复杂度偏弱风险');
    if (riskFlags.includes('missing_interaction')) structural.push('缺少有效内部交互');
    if (riskFlags.includes('fake_interaction')) structural.push('伪交互/仅悬停装饰风险');
    if (riskFlags.includes('visual_promise_unfulfilled')) structural.push('视觉承诺未兑现风险');
    structural.push(...dom.summaryFlags);

    const mediaStrength = (/clip-path|mask|<svg\b|<path\b|position\s*:\s*absolute|transform\s*:|border-radius\s*:\s*50%|aspect-ratio|radial-gradient|conic-gradient/i.test(html) && tagCount >= 35)
        ? '媒介轮廓中强'
        : (tagCount >= 40 ? '媒介轮廓中等' : '媒介轮廓弱');
    const summary = [mediaStrength, ...structural.slice(0, 6), textDensity, ...effects]
        .filter(Boolean)
        .join('；');
    const interactionFamily = detectInteractionFamily(root, html);
    const skeleton = buildVisualSkeleton(html, plain, { dom, repeated, spatialSignalCount, interactionFamily });
    const paletteFingerprint = detectPaletteFingerprint(html, renderedToto);
    return { signature: summary.slice(0, 280), skeleton: skeleton.slice(0, 420), riskFlags, paletteFingerprint, interactionFamily };
}

function normalizedText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function rawSummaryText(messageHtml) {
    const match = String(messageHtml || '').match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
    return match ? normalizedText(stripTags(match[1])) : '';
}

function renderedSummaryText(root) {
    const summary = root?.querySelector?.('summary');
    if (!summary) return '';
    const clone = summary.cloneNode(true);
    clone.querySelectorAll?.('button, [data-rabbit-mirror-maintenance-rabbit], [data-rabbit-mirror-feedback-cat], [data-rabbit-mirror-tool-entry-host]')
        ?.forEach?.(node => node.remove());
    return normalizedText(clone.textContent || '');
}

function isRenderedRabbitMirrorDetails(details) {
    if (!details?.matches?.('details')) return false;
    const title = renderedSummaryText(details);
    return /^【兔子镜[:：]/.test(title) || title.includes('兔子镜');
}

function findMirrorRootInScope(scope) {
    if (!scope?.querySelector) return null;
    const wrapped = scope.querySelector('toto[data-rabbit-mirror="true"], toto[data-rabbit-hole="true"]');
    if (wrapped) return wrapped;
    const details = [...scope.querySelectorAll('details')].filter(isRenderedRabbitMirrorDetails);
    return details[details.length - 1] || null;
}

function findRenderedToto(message, chat, messageHtml) {
    if (typeof document === 'undefined') return null;
    const messageIndex = Array.isArray(chat) ? chat.lastIndexOf(message) : -1;
    const scopes = [];
    if (messageIndex >= 0) {
        for (const selector of [
            `.mes[mesid="${messageIndex}"]`,
            `.mes[data-message-id="${messageIndex}"]`,
            `.mes[data-messageid="${messageIndex}"]`,
        ]) {
            try {
                const scope = document.querySelector(selector);
                if (scope) scopes.push(scope);
            } catch {
                // Ignore host selector differences.
            }
        }
    }
    for (const scope of scopes) {
        const found = findMirrorRootInScope(scope);
        if (found) return found;
    }

    const expectedSummary = rawSummaryText(messageHtml);
    const wrapped = [...document.querySelectorAll('toto[data-rabbit-mirror="true"], toto[data-rabbit-hole="true"]')];
    const orphanDetails = [...document.querySelectorAll('details')]
        .filter(isRenderedRabbitMirrorDetails)
        .filter(details => !details.closest('toto[data-rabbit-mirror="true"], toto[data-rabbit-hole="true"]'));
    const all = [...wrapped, ...orphanDetails];
    if (expectedSummary) {
        const matched = all.filter(root => renderedSummaryText(root) === expectedSummary);
        if (matched.length) return matched[matched.length - 1];
    }
    return all[all.length - 1] || null;
}


function messageIntegritySources(message) {
    const candidates = [];
    const seen = new Set();
    const push = source => {
        if (typeof source !== 'string') return;
        const text = source.trim();
        if (!text || seen.has(text)) return;
        seen.add(text);
        candidates.push(text);
    };
    const swipeIndex = Number.isInteger(message?.swipe_id) ? message.swipe_id : -1;
    if (swipeIndex >= 0) push(message?.swipes?.[swipeIndex]);
    push(message?.mes);
    push(message?.extra?.display_text);
    return candidates;
}

function successfulRabbitMirrorSource(message, chat) {
    for (const source of messageIntegritySources(message)) {
        const inspection = inspectRabbitMirrorGenerationSource(source);
        if (!inspection.complete) continue;
        return { source, inspection, fromSnapshot: false };
    }
    const messageIndex = Array.isArray(chat) ? chat.lastIndexOf(message) : -1;
    const title = rawSummaryText(message?.mes || '');
    const snapshot = getRabbitMirrorGenerationSnapshot(message, chat, messageIndex, title);
    if (!snapshot?.source) return null;
    const inspection = inspectRabbitMirrorGenerationSource(snapshot.source, title);
    if (!inspection.complete) return null;
    return {
        source: `<toto data-rabbit-mirror="true">${snapshot.source}</toto>`,
        inspection,
        fromSnapshot: true,
    };
}

async function scanLatestAssistantMessage(mod) {
    const chat = mod?.chat || globalThis.chat;
    if (!Array.isArray(chat) || !chat.length) return;
    captureRabbitMirrorGenerationSnapshots(chat);
    const message = [...chat].reverse().find(item => !item?.is_user && typeof item?.mes === 'string');
    if (!message || !/(?:<toto\b|<details\b)[\s\S]*?兔子镜/i.test(message.mes)) {
        console.debug('[RabbitMirror] visual commit skipped: latest assistant message has no RabbitMirror source');
        return;
    }
    const successful = successfulRabbitMirrorSource(message, chat);
    if (!successful) {
        console.debug('[RabbitMirror] visual commit skipped: incomplete RabbitMirror source');
        return;
    }
    const sourceForScan = successful.source;
    const sigHash = hashText(sourceForScan);
    if (sigHash !== lastScannedHash) {
        lastScannedHash = sigHash;
        lastScanAttempts = 0;
    } else if (lastScanAttempts >= 2) {
        return;
    }
    lastScanAttempts += 1;

    const renderedToto = findRenderedToto(message, chat, message.mes);
    const result = scanRabbitMirrorHtml(sourceForScan, renderedToto);
    const signature = result?.signature || '';
    const skeleton = result?.skeleton || '';
    const riskFlags = Array.isArray(result?.riskFlags) ? result.riskFlags : [];
    const paletteFingerprint = result?.paletteFingerprint && typeof result.paletteFingerprint === 'object'
        ? result.paletteFingerprint
        : null;
    const interactionFamily = result?.interactionFamily && typeof result.interactionFamily === 'object'
        ? result.interactionFamily
        : null;
    if (signature || skeleton || riskFlags.length || paletteFingerprint || interactionFamily) {
        updateLatestVisualSignature(signature, skeleton, riskFlags, paletteFingerprint, interactionFamily);
        const feedbackResult = consumeInjectedFeedbackForSuccessfulRabbitMirror(message);
        if (feedbackResult?.consumed) {
            console.debug('[RabbitMirror] feedback cat consumed:', feedbackResult.remainingRounds);
        }
        console.debug('[RabbitMirror] visual signature:', signature, skeleton, riskFlags, paletteFingerprint, interactionFamily);
    }
}

function clearVisualScannerTimers() {
    if (visualScannerCaptureTimer) {
        clearTimeout(visualScannerCaptureTimer);
        visualScannerCaptureTimer = 0;
    }
    for (const timer of visualScannerTimers) clearTimeout(timer);
    visualScannerTimers.clear();
}

export function destroyVisualScanner() {
    clearVisualScannerTimers();
    for (const { eventSource, eventName, handler } of visualScannerSubscriptions) {
        try { eventSource?.off?.(eventName, handler); } catch {}
    }
    visualScannerSubscriptions = [];
    if (globalThis.__rabbitMirrorVisualScannerCleanup === destroyVisualScanner) delete globalThis.__rabbitMirrorVisualScannerCleanup;
}

export async function initVisualScanner() {
    try {
        try { globalThis.__rabbitMirrorVisualScannerCleanup?.(); } catch {}
        globalThis.__rabbitMirrorVisualScannerCleanup = destroyVisualScanner;
        const mod = await import('../../../../../script.js');
        const eventSource = mod?.eventSource;
        const eventTypes = mod?.event_types || {};
        if (!eventSource?.on) return;
        const captureNow = () => {
            if (visualScannerCaptureTimer) {
                clearTimeout(visualScannerCaptureTimer);
                visualScannerCaptureTimer = 0;
            }
            try {
                captureRabbitMirrorGenerationSnapshots(mod?.chat || globalThis.chat);
            } catch (error) {
                console.debug('[RabbitMirror] generation snapshot capture skipped:', error);
            }
        };
        const scheduleCapture = (delay = 140) => {
            if (visualScannerCaptureTimer) clearTimeout(visualScannerCaptureTimer);
            visualScannerCaptureTimer = setTimeout(captureNow, Math.max(0, Number(delay) || 0));
        };
        const scheduleTimer = (handler, delay) => {
            const timer = setTimeout(() => {
                visualScannerTimers.delete(timer);
                handler();
            }, delay);
            visualScannerTimers.add(timer);
        };
        const scheduleScan = () => {
            // Multiple SillyTavern end events can fire for the same reply. Keep
            // only one early and one settled scan instead of stacking another
            // pair for every event.
            for (const timer of visualScannerTimers) clearTimeout(timer);
            visualScannerTimers.clear();
            captureNow();
            scheduleCapture(120);
            scheduleTimer(() => scanLatestAssistantMessage(mod), 650);
            scheduleTimer(() => scanLatestAssistantMessage(mod), 1750);
        };
        const subscribe = (eventName, handler) => {
            if (!eventName) return;
            eventSource.on(eventName, handler);
            visualScannerSubscriptions.push({ eventSource, eventName, handler });
        };
        const captureEvents = [
            eventTypes.MESSAGE_UPDATED,
            eventTypes.CHARACTER_MESSAGE_RENDERED,
            eventTypes.MESSAGE_RECEIVED,
        ].filter(Boolean);
        for (const eventName of [...new Set(captureEvents)]) {
            const handler = () => scheduleCapture(140);
            subscribe(eventName, handler);
        }
        const generationEvents = [eventTypes.MESSAGE_RECEIVED, eventTypes.GENERATION_STOPPED, eventTypes.GENERATION_ENDED].filter(Boolean);
        for (const eventName of [...new Set(generationEvents)]) subscribe(eventName, scheduleScan);
        subscribe(eventTypes.CHAT_CHANGED, scheduleScan);
        console.debug('[RabbitMirror] visual scanner initialized');
    } catch (error) {
        console.debug('[RabbitMirror] visual scanner disabled:', error);
    }
}
