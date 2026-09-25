import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_evidence from '../core/evidence.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import { roomNarrativeClaimsSharedHistory, roomTextContainsAnchor } from './roomProfile.js';
import { normalizeRoomPetSpecies } from './roomPets.js';
// 房间布局与绘制：时段、场景类别、物件摆放与图标、布局 CSS、宠物节点
// 从 modes/room.js 原样搬出（重构阶段 2），声明文本一字未改；modes/room.js 仍转发原有导出。

const ROOM_OBJECT_VISUAL_KINDS = new Set(['book', 'music', 'plant', 'tech', 'tool', 'fitness', 'pet', 'storage', 'light', 'seat', 'table', 'art', 'travel', 'other']);

const ROOM_MOTIF_VALUES = new Set(['literary', 'musical', 'botanical', 'technical', 'artisan', 'athletic', 'companion', 'traveler', 'collector', 'minimal', 'domestic']);

export function roomDaypartState(date = new Date()) {
    const hour = date.getHours();
    if (hour >= 5 && hour < 11) return { key: 'morning', label: '早晨' };
    if (hour >= 11 && hour < 17) return { key: 'daytime', label: '白天' };
    if (hour >= 17 && hour < 22) return { key: 'evening', label: '傍晚' };
    return { key: 'night', label: '深夜' };
}

export function roomClockText(date = new Date()) {
    try {
        return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    } catch {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
}

export function roomSceneClass(spaceType, label = '') {
    const text = `${core_text.normalizeText(spaceType, 80)} ${core_text.normalizeText(label, 100)}`.toLowerCase();
    if (/音乐|录音|琴房|排练|music|record|studio/.test(text)) return 'studio';
    if (/实验|研究|化验|lab|laboratory/.test(text)) return 'lab';
    if (/浴室|浴房|洗浴|盥洗|bath|shower/.test(text)) return 'bath';
    if (/餐厅|饭厅|餐室|dining/.test(text)) return 'dining';
    if (/书房|藏书|阅读室|study|library/.test(text)) return 'study';
    if (/营帐|帐篷|tent/.test(text)) return 'tent';
    if (/船|舱|舰|cabin|ship/.test(text)) return 'cabin';
    if (/厨房|料理|kitchen/.test(text)) return 'kitchen';
    if (/阳台|露台|庭院|花园|balcony|terrace|garden/.test(text)) return 'balcony';
    if (/卧室|寝室|睡眠|bedroom/.test(text)) return 'bedroom';
    if (/客厅|起居|会客|living|lounge/.test(text)) return 'lounge';
    if (/工坊|工作间|手作|驾驶|atelier|workshop/.test(text)) return 'workshop';
    if (/和室|传统|古风|茶室/.test(text)) return 'traditional';
    if (/办公室|office/.test(text)) return 'office';
    return 'neutral';
}

export function roomLayoutVariant(space) {
    const h = core_text.hashString(`${core_text.normalizeText(space?.id, 80)}|${core_text.normalizeText(space?.label, 100)}|${core_text.normalizeText(space?.spaceType, 80)}|${core_text.normalizeText(space?.atmosphere, 240)}`);
    return (h % 3) + 1;
}

export function roomObjectPlacement(item, index, layout = null) {
    const column = Number.isInteger(layout?.column) && layout.column >= 1 && layout.column <= 3 ? layout.column : (Math.max(0, Number(index) || 0) % 3) + 1;
    const row = Number.isInteger(layout?.row) && layout.row >= 1 ? layout.row : Math.floor(Math.max(0, Number(index) || 0) / 3) + 1;
    return `--rmt-object-column:${column};--rmt-object-row:${row}`;
}

// One code-owned layout owns icon, name, number and click identity. Zone preferences
// choose free cells, not overlapping percentage hotspots on unrelated furniture art.
export function roomObjectLayout(space) {
    const objects = Array.isArray(space?.objects) ? space.objects.filter(item => item && typeof item === 'object') : [];
    const rowCount = Math.max(1, Math.ceil(objects.length / 3));
    const available = Array.from({ length: rowCount * 3 }, (_, index) => ({ row: Math.floor(index / 3) + 1, column: index % 3 + 1 }));
    const placed = objects.map((item, sourceIndex) => {
        const zone = core_constants.ROOM_ZONE_VALUES.has(item.zone) ? item.zone : '中央';
        const preferredColumn = zone.startsWith('左') ? 1 : zone.startsWith('右') ? 3 : 2;
        const preferredRow = zone.endsWith('上') ? 1 : zone === '近景' || zone.endsWith('下') ? rowCount : Math.ceil(rowCount / 2);
        let best = 0;
        const distance = cell => Math.abs(cell.row - preferredRow) * 3 + Math.abs(cell.column - preferredColumn);
        for (let index = 1; index < available.length; index++) if (distance(available[index]) < distance(available[best])) best = index;
        const cell = available.splice(best, 1)[0];
        return { item, id: String(item.id || ''), sourceIndex, zone, visualKind: roomObjectVisualKind(item), ...cell };
    });
    // DOM/tab/list order is the same as the visible reading order, including mobile reflow.
    return placed.sort((a, b) => a.row - b.row || a.column - b.column).map((entry, index) => ({ ...entry, index, number: index + 1 }));
}

const ROOM_OBJECT_ICON_PATHS = Object.freeze({
    book: '<path d="M5 7h8a5 5 0 0 1 3 1 5 5 0 0 1 3-1h8v19h-8a5 5 0 0 0-3 1 5 5 0 0 0-3-1H5zM16 8v19M8 12h4M20 12h4M8 17h4M20 17h4"/>',
    music: '<path d="M13 22V8l13-3v14M13 13l13-3"/><ellipse cx="9" cy="23" rx="4" ry="3"/><ellipse cx="22" cy="20" rx="4" ry="3"/>',
    plant: '<path d="M10 21h12l-2 8h-8zM16 21V11M16 16C7 17 5 11 6 7c7 0 10 3 10 9zM16 12C16 5 22 3 27 4c0 6-5 10-11 8z"/>',
    tech: '<rect x="4" y="5" width="24" height="17" rx="2"/><path d="M11 28h10M16 22v6M8 9h5M8 13h9"/>',
    tool: '<path d="M22 4a7 7 0 0 0-8 9L4 23a3 3 0 0 0 5 5l10-10a7 7 0 0 0 9-8l-5 5-6-6z"/>',
    fitness: '<path d="M12 16h8M5 10h7v12H5zM20 10h7v12h-7zM2 13v6M30 13v6"/>',
    pet: '<ellipse cx="8" cy="11" rx="3" ry="4"/><ellipse cx="24" cy="11" rx="3" ry="4"/><ellipse cx="14" cy="7" rx="2.5" ry="4"/><ellipse cx="20" cy="7" rx="2.5" ry="4"/><path d="M8 24c0-4 5-10 8-10s8 6 8 10c0 6-5 2-8 2s-8 4-8-2z"/>',
    storage: '<rect x="5" y="4" width="22" height="24" rx="2"/><path d="M5 12h22M5 20h22M13 8h6M13 16h6M13 24h6"/>',
    light: '<path d="M11 4h10l6 14H5zM16 18v10M10 28h12M23 18v5"/>',
    seat: '<path d="M8 17V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v9M8 17h16v7H8zM5 14v10M27 14v10M9 24v5M23 24v5"/>',
    table: '<path d="M3 11h26v5H3zM7 16v13M25 16v13M9 6h7M12 3v3"/>',
    art: '<rect x="4" y="4" width="24" height="24" rx="2"/><circle cx="11" cy="11" r="2"/><path d="m7 24 8-10 5 6 3-3 3 7"/>',
    travel: '<rect x="5" y="9" width="22" height="18" rx="3"/><path d="M12 9V5h8v4M10 9v18M22 9v18M10 27v3M22 27v3"/>',
    bed: '<path d="M4 10v19M28 17v12M4 24h24M4 17h24v7M8 12h7v5H8zM18 12h7v5h-7z"/>',
    cup: '<path d="M6 10h17v11a6 6 0 0 1-6 6h-5a6 6 0 0 1-6-6zM23 12h3a4 4 0 0 1 0 8h-3M5 30h20M10 3v3M16 2v4"/>',
    window: '<rect x="5" y="4" width="22" height="24" rx="1"/><path d="M16 4v24M5 16h22M2 28h28"/>',
    other: '<path d="m16 3 12 7v13l-12 7L4 23V10zM4 10l12 7 12-7M16 17v13"/>',
});

export function roomObjectIconHtml(kind) {
    const key = Object.hasOwn(ROOM_OBJECT_ICON_PATHS, kind) ? kind : 'other';
    return `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" data-rmt-icon="${key}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ROOM_OBJECT_ICON_PATHS[key]}</svg>`;
}

export function roomObjectLayoutButtonHtml(entry, surface = 'scene', selectedId = '', focusId = '') {
    const scene = surface !== 'rail';
    const label = core_text.normalizeText(entry.item?.label, 100) || '未命名物件';
    const selected = entry.id === selectedId;
    const number = Math.max(1, Math.floor(Number(entry.number) || 1));
    return `<button type="button" class="${scene ? 'rmt-room-layout-object' : 'rmt-room-object-chip rmt-room-layout-chip'} ${selected ? 'active' : ''} ${entry.id === focusId ? 'focus' : ''}"${scene ? ` style="${roomObjectPlacement(entry.item, entry.index, entry)}"` : ''} data-rmt-room-id="${core_text.esc(entry.id)}" data-rmt-room-number="${number}" data-rmt-visual-kind="${core_text.esc(entry.visualKind)}" aria-pressed="${selected}" aria-controls="${core_constants.OVERLAY_ID}_room_object_detail" aria-label="${core_text.esc(`${number}. ${label}${entry.item?.searchable ? '，可翻找' : ''}`)}"><span class="rmt-room-layout-number">${number}</span>${roomObjectIconHtml(entry.visualKind)}<b class="rmt-room-layout-name">${core_text.esc(label)}</b>${entry.item?.searchable ? '<em>可翻找</em>' : ''}</button>`;
}

// Scoped, local-only component CSS. No provider styles/SVG/coordinates enter the DOM.
export function roomLayoutCss(root = `#${core_constants.OVERLAY_ID}`) {
    return `${root} .rmt-room-view .rmt-room-layout-scene{min-height:0;padding:24px 16px 12px;isolation:isolate}
${root} .rmt-room-view .rmt-room-layout-scene:before{inset:0;width:auto;height:auto;border:0;border-radius:0;clip-path:none;box-shadow:none;transform:none;background:linear-gradient(135deg,transparent,var(--rmt-room-wash));pointer-events:none;z-index:0}
${root} .rmt-room-view .rmt-room-layout-scene:after{display:none}
${root} .rmt-room-view[data-rmt-room-world="historical"] .rmt-room-layout-scene:before{background:repeating-linear-gradient(90deg,transparent 0 48px,var(--rmt-room-wash) 49px 52px)}
${root} .rmt-room-view[data-rmt-room-world="fantasy"] .rmt-room-layout-scene:before{background:radial-gradient(ellipse at 50% 20%,var(--rmt-room-soft),transparent 65%)}
${root} .rmt-room-view[data-rmt-room-world="scifi"] .rmt-room-layout-scene:before{background:repeating-linear-gradient(90deg,transparent 0 48px,var(--rmt-room-wash) 49px 51px),repeating-linear-gradient(0deg,transparent 0 40px,var(--rmt-room-wash) 41px 43px)}
${root} .rmt-room-object-layout{position:relative;z-index:8;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:stretch}
${root} .rmt-room-layout-object{grid-column:var(--rmt-object-column);grid-row:var(--rmt-object-row);min-width:0;min-height:106px;display:grid;grid-template-columns:24px minmax(0,1fr) 24px;justify-items:center;align-content:center;gap:6px;border:1px solid var(--rmt-room-accent);border-radius:12px;background:var(--rmt-room-paper);color:var(--rmt-room-accent-deep);padding:12px 8px;font:inherit;cursor:pointer;touch-action:manipulation;box-shadow:0 4px 0 color-mix(in srgb,var(--rmt-room-accent) 18%,transparent);transition:background .15s ease,border-color .15s ease}
${root} .rmt-room-layout-object svg{grid-column:2;width:40px;height:40px}
${root} .rmt-room-layout-object .rmt-room-layout-number{grid-column:1;grid-row:1;align-self:start;display:grid;place-items:center;min-width:24px;min-height:24px;border-radius:50%;background:var(--rmt-room-soft);font-size:12px;font-weight:800}
${root} .rmt-room-layout-object .rmt-room-layout-name{grid-column:1/-1;max-width:100%;font-size:13px;line-height:1.5;overflow-wrap:anywhere;text-align:center}
${root} .rmt-room-layout-object em{grid-column:1/-1;font-size:11px;font-style:normal}
${root} .rmt-room-layout-object.active,${root} .rmt-room-layout-chip.active{background:var(--rmt-room-soft);border-color:var(--rmt-room-accent-deep);box-shadow:inset 0 0 0 1px var(--rmt-room-accent-deep)}
${root} .rmt-room-layout-object.focus:after{content:'正在使用';grid-column:1/-1;font-size:11px;line-height:1.4}
${root} .rmt-room-layout-object:hover,${root} .rmt-room-layout-chip:hover{background:var(--rmt-room-soft)}
${root} .rmt-room-layout-object:focus-visible,${root} .rmt-room-layout-chip:focus-visible{outline:3px solid var(--rmt-room-accent-deep);outline-offset:3px}
${root} .rmt-room-layout-object:active,${root} .rmt-room-layout-chip:active{border-color:var(--rmt-room-accent-deep)}
${root} .rmt-room-object-rail .rmt-room-layout-chip{min-height:48px;grid-template-columns:24px 24px minmax(0,1fr);gap:8px;padding:8px;text-align:left}
${root} .rmt-room-layout-chip svg{width:24px;height:24px}
${root} .rmt-room-layout-chip .rmt-room-layout-name{font-size:12px;line-height:1.5;white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere}
${root} .rmt-room-layout-chip em{grid-column:3;font-size:11px}
${root} .rmt-room-presence-stage{position:relative;z-index:5;height:186px;margin-top:18px;pointer-events:none}
${root} .rmt-room-presence-stage.is-empty{height:80px}
${root} .rmt-room-presence-stage .rmt-room-person{left:50%;bottom:8px;transform:translateX(-50%);pointer-events:auto}
${root} .rmt-room-layout-caption{position:relative;z-index:1;margin:12px 0 0;text-align:center;font-size:12px;color:var(--rmt-room-accent-deep);line-height:1.5}
@media(max-width:600px){${root} .rmt-room-view .rmt-room-layout-scene{padding:16px 12px 10px}${root} .rmt-room-object-layout{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}${root} .rmt-room-layout-object{grid-column:auto;grid-row:auto;min-height:108px}${root} .rmt-room-layout-object svg{width:36px;height:36px}${root} .rmt-room-layout-object .rmt-room-layout-name{font-size:12px}${root} .rmt-room-object-rail .rmt-room-layout-chip{grid-template-columns:24px 24px minmax(0,1fr)}}
@media(prefers-reduced-motion:reduce){${root} .rmt-room-layout-object,${root} .rmt-room-layout-chip{transition:none}}`;
}

export function roomTemporaryPlacement(label, index) {
    const h = core_text.hashString(`temp|${label}|${index}`);
    const x = 16 + (h % 68);
    const y = 58 + ((h >>> 7) % 24);
    const r = ((h >>> 13) % 9) - 4;
    return `--rtx:${x}%;--rty:${y}%;--rtr:${r}deg`;
}

export function roomObjectVisualKind(item) {
    const classify = text => {
    if (/宠物|猫|狗|鸟|鱼|窝|笼|水族|\b(?:pet|cat|dog|bird|aquarium)\b/.test(text)) return 'pet';
    if (/行李|地图|车票|护照|旅行|luggage|map|ticket|travel/.test(text)) return 'travel';
    if (/柜|箱|盒|包|抽屉|收纳|cabinet|box|drawer|storage/.test(text)) return 'storage';
    if (/床|卧榻|bed|futon/.test(text)) return 'bed';
    if (/窗|window/.test(text)) return 'window';
    if (/书桌|餐桌|工作台|桌|书案|几案|案几|台面|desk|table|workbench/.test(text)) return 'table';
    if (/椅|沙发|坐垫|chair|sofa|seat/.test(text)) return 'seat';
    if (/杯|茶壶|水壶|cup|mug|teapot/.test(text)) return 'cup';
    if (/书|杂志|文件|卷宗|阅读|book|magazine|file/.test(text)) return 'book';
    if (/琴|乐器|唱片|音箱|耳机|麦克风|music|guitar|piano|record|speaker/.test(text)) return 'music';
    if (/植物|花|盆栽|草|花园|plant|flower|garden/.test(text)) return 'plant';
    if (/电脑|显示器|终端|设备|仪器|机械|screen|terminal|device|computer|console/.test(text)) return 'tech';
    if (/工具|工作台|工坊|零件|材料|tool|workbench|craft/.test(text)) return 'tool';
    if (/健身|训练|球|哑铃|跑步|运动|fitness|training|sport/.test(text)) return 'fitness';
    if (/灯|蜡烛|灯笼|light|lamp|candle/.test(text)) return 'light';
    if (/画|摄影|相机|镜|模型|雕塑|手稿|art|photo|model|sketch|mirror|camera/.test(text)) return 'art';
    return 'other';
    };
    // Incidental prose ("a chair next to books") must not change the named object icon.
    const named = classify(core_text.normalizeText(item?.label, 100).toLowerCase());
    return named !== 'other' ? named : classify(core_text.normalizeText(item?.description, 1600).toLowerCase());
}

export function roomMotifToken(session, space) {
    const objects = (Array.isArray(space?.objects) ? space.objects : []).map(item => roomObjectVisualKind(item));
    const counts = new Map();
    for (const kind of objects) counts.set(kind, (counts.get(kind) || 0) + 1);
    const mapped = [
        ['book', 'literary'], ['music', 'musical'], ['plant', 'botanical'], ['tech', 'technical'],
        ['tool', 'artisan'], ['fitness', 'athletic'], ['pet', 'companion'], ['travel', 'traveler'],
        ['art', 'collector'],
    ];
    mapped.sort((a, b) => (counts.get(b[0]) || 0) - (counts.get(a[0]) || 0));
    const best = mapped[0];
    if (best && (counts.get(best[0]) || 0) > 0) return best[1];
    const density = core_text.normalizeText(session?.visualProfile?.density, 20);
    const fallback = density === 'sparse' ? 'minimal' : 'domestic';
    return ROOM_MOTIF_VALUES.has(fallback) ? fallback : 'domestic';
}

export function roomPetPlacement(pet, index) {
    const petId = core_text.safeId(pet?.id, `PET${Number(index) + 1}`);
    const petName = core_text.normalizeText(pet?.name, 60);
    const spaceId = core_text.safeId(pet?.spaceId, '');
    const h = core_text.hashString(`pet|${petId}|${petName}|${spaceId}`);
    const x = 18 + (h % 65);
    const y = 70 + ((h >>> 7) % 15);
    const flip = (h >>> 12) % 2 ? 1 : -1;
    return `--rmt-pet-x:${x}%;--rmt-pet-y:${y}%;--rmt-pet-flip:${flip}`;
}

export function roomPetNodeHtml(pet, index = 0) {
    const species = normalizeRoomPetSpecies(pet?.species);
    const id = core_text.safeId(pet?.id, `PET${Number(index) + 1}`);
    const name = core_text.normalizeText(pet?.name, 60) || '宠物';
    const description = core_text.normalizeText(pet?.description, 900);
    return `<span class="rmt-room-pet" style="${roomPetPlacement({ ...pet, id, name }, index)}" data-rmt-pet-id="${core_text.esc(id)}" data-rmt-pet-species="${core_text.esc(species)}" aria-label="${core_text.esc(`${name}：${description}`)}"><span class="rmt-room-pet-tail" aria-hidden="true"></span><span class="rmt-room-pet-body" aria-hidden="true"></span><span class="rmt-room-pet-name">${core_text.esc(name)}</span></span>`;
}

export function roomPetSummaryHtml(pet) {
    const name = core_text.normalizeText(pet?.name, 60) || '宠物';
    const description = core_text.normalizeText(pet?.description, 900);
    const line = core_text.normalizeText(pet?.line, 500);
    const anchor = core_text.normalizeText(pet?.sourceMemoryAnchor, 120);
    const evidence = pet?.basis === '记忆' && anchor
        ? `<small>档案痕迹：${core_text.esc(anchor)}</small>`
        : '<small>来源：角色设定 / 世界观</small>';
    return `<div class="rmt-room-pet-note"><b>🐾 ${core_text.esc(name)}</b><span>${core_text.esc(description)}</span>${line ? `<em>${core_text.esc(line)}</em>` : ''}${evidence}</div>`;
}

export function roomObjectSafeForPresentation(item, memoryBank, userName) {
    const narrative = [item?.label, item?.description, item?.line];
    if (!narrative.some(field => roomNarrativeClaimsSharedHistory(field, memoryBank || userName))) return true;
    if (item?.basis !== '记忆') return false;
    const reference = core_evidence.normalizeExactMemoryReference(
        item?.sourceMemoryIds,
        item?.sourceMemoryAnchor,
        memoryBank || { memories: [] },
        1,
    );
    return reference.sourceMemoryIds.length >= 1
        && !!reference.sourceMemoryAnchor
        && roomTextContainsAnchor(narrative.join('\n'), reference.sourceMemoryAnchor);
}

export function roomDeepAvailability() {
    const options = runtimeState.activeArchiveSnapshot ? { chatId: runtimeState.activeArchiveSnapshot.chatId, memoryBank: runtimeState.activeArchiveSnapshot.memory, cache: runtimeState.activeArchiveSnapshot.cache, clone: true } : {};
    return {
        items: core_cache.loadSession(core_constants.MODE.ITEMS, { ...options, includePartial: true }),
        phone: core_cache.loadSession(core_constants.MODE.PHONE, { ...options, includePartial: true }),
    };
}
