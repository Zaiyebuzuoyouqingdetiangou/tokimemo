// 爱心信的六款信封。只换画法，不改生成提示词。
import * as core_constants from '../core/constants.js';

const TITLES = Object.freeze({
    pink: '现在 粉色信封',
    wax: 'A 蜡封信',
    night: 'B 星夜信',
    sakura: 'C 樱花信',
    airmail: 'D 航空邮简',
    wash: 'E 水彩渐变',
});

function svg(body) {
    return `<svg class="rmt-envelope" viewBox="0 0 280 190" aria-hidden="true" focusable="false">${body}</svg>`;
}

function pinkBody() {
    return `<rect x="8" y="18" width="264" height="164" rx="22" fill="#f6c6d4"/>
        <path d="M8 146 L140 86 L272 146 L272 160 Q272 182 250 182 L30 182 Q8 182 8 160 Z" fill="#f3b4c8"/>
        <path d="M8 146 L140 86 L140 182 L30 182 Q8 182 8 160 Z" fill="#eea9c0"/>
        <path d="M20 36 L260 36 L140 124 Z" fill="#fff2f5"/>
        <path d="M20 36 L140 124 L140 36 Z" fill="#fde7ee"/>
        <path d="M140 112c-15-13-34-26-34-43 0-12 9-21 21-21 7 0 13 4 13 4s6-4 13-4c12 0 21 9 21 21 0 17-19 30-34 43z" fill="#d64578"/>`;
}

function waxBody() {
    return `<rect x="8" y="18" width="264" height="164" rx="18" fill="#f3e6d0"/>
        <path d="M8 148 L140 84 L272 148 V162 Q272 182 250 182 H30 Q8 182 8 162 Z" fill="#e7d3b4"/>
        <path d="M22 34 H258 L140 122 Z" fill="#fbf6ee"/>
        <path d="M22 34 L140 122 V34 Z" fill="#f4ead8"/>
        <circle cx="140" cy="100" r="24" fill="#8e2a2a"/>
        <circle cx="140" cy="100" r="18" fill="#a33b3b"/>
        <path d="M140 108c-5-4-10-8-10-13 0-4 3-6 6-6 2 0 4 1 4 1s2-1 4-1c3 0 6 2 6 6 0 5-5 9-10 13z" fill="#f6d5d8"/>`;
}

function nightBody() {
    return `<rect x="8" y="18" width="264" height="164" rx="18" fill="#15233f"/>
        <path d="M8 148 L140 82 L272 148 V162 Q272 182 250 182 H30 Q8 182 8 162 Z" fill="#1c2e52"/>
        <path d="M22 34 H258 L140 120 Z" fill="none" stroke="#e4c56a" stroke-width="2"/>
        <path d="M22 34 L140 120" fill="none" stroke="#e4c56a" stroke-width="1.4"/>
        <path d="M258 34 L140 120" fill="none" stroke="#e4c56a" stroke-width="1.4"/>
        <circle cx="46" cy="58" r="1.4" fill="#f4e7b2"/><circle cx="78" cy="48" r="1.2" fill="#f4e7b2"/>
        <circle cx="210" cy="52" r="1.3" fill="#f4e7b2"/><circle cx="236" cy="70" r="1.1" fill="#f4e7b2"/>
        <circle cx="188" cy="40" r="1.2" fill="#f4e7b2"/>
        <path d="M128 92a16 16 0 1 0 18 10 12 12 0 1 1-18-10z" fill="#f3e7c2"/>`;
}

function blossom(cx, cy) {
    return `<g fill="#f4a8c0" transform="translate(${cx} ${cy})"><circle cx="-6" cy="0" r="4"/><circle cx="6" cy="0" r="4"/><circle cx="0" cy="-6" r="4"/><circle cx="0" cy="6" r="4"/><circle cx="0" cy="0" r="2.2" fill="#f7d7e2"/></g>`;
}

function sakuraBody() {
    return `<rect x="8" y="18" width="264" height="164" rx="22" fill="#fde8ef"/>
        <path d="M8 148 L140 86 L272 148 V162 Q272 182 250 182 H30 Q8 182 8 162 Z" fill="#f8d5e2"/>
        <path d="M22 34 H258 L140 120 Z" fill="#fff7f9"/>
        ${blossom(48, 64)}${blossom(228, 58)}${blossom(62, 150)}${blossom(214, 146)}
        <path d="M140 108c-8-7-18-14-18-23 0-6 5-11 11-11 4 0 7 2 7 2s3-2 7-2c6 0 11 5 11 11 0 9-10 16-18 23z" fill="#e56b92"/>`;
}

function airmailBody() {
    let lines = '';
    for (let index = -4; index < 22; index += 1) {
        const x = index * 16;
        lines += `<line x1="${x}" y1="200" x2="${x + 92}" y2="-8" stroke="${index % 2 ? '#2a4f96' : '#d64545'}" stroke-width="8"/>`;
    }
    return `${lines}
        <rect x="22" y="30" width="236" height="132" fill="#fffdf8"/>
        <text x="36" y="72" fill="#2a4f96" font-size="14" font-family="Georgia, 'Times New Roman', serif" letter-spacing="1.4">PAR AVION</text>
        <path d="M36 92 H168 M36 106 H168 M36 120 H120" stroke="#c9bbaa" stroke-width="1.2"/>
        <circle cx="176" cy="58" r="15" fill="none" stroke="#7d6a62" stroke-width="1.3"/>
        <circle cx="176" cy="58" r="10" fill="none" stroke="#7d6a62" stroke-width="1"/>
        <rect x="198" y="36" width="46" height="38" rx="3" fill="#f7c5d4" stroke="#e08aa6"/>
        <path d="M221 56c-4-4-9-6-9-2 0 5 9 9 9 9s9-4 9-9c0-4-5-2-9 2z" fill="#d64578"/>`;
}

function washBody() {
    return `<rect x="8" y="18" width="264" height="164" rx="22" fill="#e5d2f4"/>
        <ellipse cx="214" cy="150" rx="150" ry="110" fill="#f8c9b4"/>
        <ellipse cx="52" cy="46" rx="78" ry="52" fill="#f6e7fb"/>
        <path d="M8 148 L140 86 L272 148" fill="none" stroke="#fff" stroke-width="3" opacity=".85"/>
        <path d="M140 112c-12-10-26-20-26-33 0-9 7-16 16-16 5 0 10 3 10 3s5-3 10-3c9 0 16 7 16 16 0 13-14 23-26 33z" fill="#fff"/>`;
}

const BODIES = Object.freeze({
    pink: pinkBody,
    wax: waxBody,
    night: nightBody,
    sakura: sakuraBody,
    airmail: airmailBody,
    wash: washBody,
});

export function heartEnvelopeSvg(skin) {
    const id = core_constants.HEART_ENVELOPE_SKINS.includes(skin) ? skin : 'pink';
    return svg(BODIES[id]());
}

export function heartEnvelopePickerHtml(selected) {
    const current = core_constants.HEART_ENVELOPE_SKINS.includes(selected) ? selected : 'pink';
    const options = core_constants.HEART_ENVELOPE_SKINS.map(id => {
        const on = id === current;
        return `<label class="rmt-envelope-option${on ? ' is-on' : ''}"><input type="radio" name="rmt-heart-envelope" data-rmt-heart-envelope value="${id}" ${on ? 'checked' : ''}><span class="rmt-envelope-art">${heartEnvelopeSvg(id)}</span><span>${TITLES[id]}</span></label>`;
    }).join('');
    return `<fieldset class="rmt-envelope-picker"><legend>信封样式</legend><p>六款一样大。选中的会用在聊天里的那封信上。</p>${options}</fieldset>`;
}

export function heartEnvelopePickerCss(root) {
    return `
${root} .rmt-envelope-picker{border:0;margin:0;padding:0;display:grid;gap:12px;min-width:0}
${root} .rmt-envelope-picker legend{font-size:14px;font-weight:750;line-height:1.5;padding:0}
${root} .rmt-envelope-picker p{margin:0;font-size:14px;line-height:1.65}
${root} .rmt-envelope-picker{grid-template-columns:1fr}
${root} .rmt-envelope-options,${root} .rmt-envelope-picker{align-items:stretch}
${root} .rmt-envelope-picker{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:12px}
${root} .rmt-envelope-picker legend,${root} .rmt-envelope-picker p{grid-column:1/-1}
${root} .rmt-envelope-option{position:relative;display:grid;justify-items:center;align-content:start;gap:8px;margin:0;padding:12px;border:1px solid var(--rmt-theme-border,#cbdce6);border-radius:16px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#334155);cursor:pointer;min-height:44px}
${root} .rmt-envelope-option input{position:absolute;width:1px;height:1px;margin:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%)}
${root} .rmt-envelope-option .rmt-envelope{display:block;width:min(100%,240px);height:auto}
${root} .rmt-envelope-option span:last-child{font-size:14px;line-height:1.4;text-align:center}
${root} .rmt-envelope-option.is-on{outline:3px solid var(--rmt-theme-accent-ink,#5f5770);outline-offset:2px}
${root} .rmt-envelope-option:has(input:focus-visible){outline:3px solid var(--rmt-theme-accent-ink,#5f5770);outline-offset:3px}
`;
}
