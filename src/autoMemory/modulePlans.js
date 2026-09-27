// 每个模块的有限计划。目录出来后才补全步骤；空计划不生成成果。

export const ROOM_REPAIR_LIMIT = 2;
export const PHONE_APP_CONCURRENCY = 2;
const ALBUM_BATCH = 3;
const ADV_BATCH = 6;
const ROOM_BATCH = 6;

function step(id, kind, order) {
    return { id, kind, order, status: 'pending', recoverySlot: '' };
}

function numbered(prefix, count, kind, start) {
    const rows = [];
    for (let index = 0; index < count; index += 1) rows.push(step(`${prefix}-${index + 1}`, kind, start + index));
    return rows;
}

function shell(moduleId, facts, steps, min, max) {
    if (!steps.length) return null;
    return {
        version: 1,
        drawId: facts.drawId || 'drawpending',
        moduleId,
        chatId: facts.chatId || 'chat',
        archiveRevision: facts.archiveRevision || 'current',
        sourceMemoryIds: Array.isArray(facts.sourceMemoryIds) ? facts.sourceMemoryIds : [],
        expectedRequestRange: { min, max },
        steps: steps.map((item, index) => ({ ...item, order: index })),
        frozenAt: Number.isSafeInteger(facts.frozenAt) ? facts.frozenAt : 0,
    };
}

function count(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function batches(total, size) {
    const known = count(total);
    if (known == null) return null;
    if (known === 0) return 0;
    return Math.ceil(known / size);
}

function catalog(id) {
    return [step(id, 'catalog', 0)];
}

// 没生成过时，空增量不能把模块直接拿掉，先做一次目录。
function firstCatalog(moduleId, known, id) {
    if (known.firstGeneration !== true) return null;
    return shell(moduleId, known, catalog(id), 1, null);
}

function token(value) {
    const text = String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
    return /^[A-Za-z0-9_-]{1,60}$/.test(text) ? text : '';
}

function albumSteps(unlocked) {
    const groups = batches(unlocked, ALBUM_BATCH);
    if (!groups) return null;
    return [step('index', 'index', 0), step('relations', 'snapshot', 1), ...numbered('comment', groups, 'comments', 2)];
}

function roomSteps(slots, repairs) {
    const groups = batches(slots, ROOM_BATCH);
    if (groups == null) return null;
    const fix = Math.min(ROOM_REPAIR_LIMIT, count(repairs) || 0);
    return [step('structure', 'structure', 0), ...numbered('slot', groups, 'slots', 1), ...numbered('repair', fix, 'repair', 1 + groups)];
}

function phoneSteps(ids, { incremental = false } = {}) {
    const apps = (Array.isArray(ids) ? ids : []).map((id, index) => token(id) || `app-${index + 1}`);
    if (!apps.length) return null;
    const head = incremental ? [step('update-plan', 'catalog', 0)] : [step('catalog', 'catalog', 0)];
    return [...head, ...apps.map((id, index) => step(`app-${id}`, 'app', index + 1))];
}

export function buildModulePlan(moduleId, facts = {}) {
    const known = facts || {};
    if (moduleId === 'inbox') {
        const letters = count(known.letters);
        if (letters === 0) return firstCatalog(moduleId, known, 'letters');
        return shell(moduleId, known, letters == null ? catalog('letters') : [step('letters', 'letters', 0)], letters ? 1 : 0, 1);
    }
    if (moduleId === 'cabinet' || moduleId === 'calendar' || moduleId === 'relations') {
        return shell(moduleId, known, [step('body', 'generate', 0)], 1, 1);
    }
    if (moduleId === 'themeSong') return shell(moduleId, known, [step('song-next', 'song', 0)], 1, 1);
    if (moduleId === 'timeEcho') return shell(moduleId, known, [step('echo', 'echo', 0)], 1, 1);
    if (moduleId === 'bedtime') {
        if (known.bedtime?.action === 'continue') {
            const storyId = token(known.bedtime.storyId);
            if (!storyId) return null;
            return shell(moduleId, known, [step(`cont-${storyId}`, 'chapter', 0)], 1, 1);
        }
        return shell(moduleId, known, [step('bed-new', 'chapter', 0)], 1, 1);
    }
    if (moduleId === 'travel') {
        const steps = known.needsBody === true ? [step('map', 'map', 0), step('prose', 'prose', 1)] : [step('map', 'map', 0)];
        return shell(moduleId, known, steps, 1, known.needsBody === true ? 2 : 1);
    }
    if (moduleId === 'items') {
        if (known.roomReady === false) return null;
        return shell(moduleId, known, [step('structure', 'structure', 0), step('lines', 'lines', 1)], 2, 2);
    }
    if (moduleId === 'album') {
        const steps = albumSteps(known.unlocked);
        if (known.unlocked === 0) return firstCatalog(moduleId, known, 'index');
        return shell(moduleId, known, steps || catalog('index'), steps ? 2 + batches(known.unlocked, ALBUM_BATCH) : 1, steps ? 2 + batches(known.unlocked, ALBUM_BATCH) : null);
    }
    if (moduleId === 'room') {
        const steps = roomSteps(known.slots, known.repairs);
        return shell(moduleId, known, steps || catalog('structure'), steps ? steps.length : 1, steps ? steps.length : null);
    }
    if (moduleId === 'phone') {
        const ids = Array.isArray(known.appIds) ? known.appIds : [];
        if (known.incremental === true && count(known.updates) === 0) return firstCatalog(moduleId, known, 'catalog');
        if (known.incremental !== true && count(known.apps) === 0) return firstCatalog(moduleId, known, 'catalog');
        const steps = ids.length ? phoneSteps(ids, { incremental: known.incremental === true }) : catalog(known.incremental === true ? 'update-plan' : 'catalog');
        const total = ids.length ? ids.length + 1 : 1;
        return shell(moduleId, known, steps, total, ids.length ? total : null);
    }
    if (moduleId === 'adv') {
        const groups = batches(known.events, ADV_BATCH);
        if (known.events === 0) return firstCatalog(moduleId, known, 'index');
        const steps = groups ? [step('index', 'index', 0), ...numbered('event', groups, 'events', 1)] : catalog('index');
        return shell(moduleId, known, steps, groups ? 1 + groups : 1, groups ? 1 + groups : null);
    }
    if (moduleId === 'ending') {
        const routes = count(known.routes);
        if (routes === 0) return firstCatalog(moduleId, known, 'index');
        const confession = known.confession === true ? 1 : 0;
        const steps = routes ? [step('index', 'index', 0), ...numbered('route', routes, 'route', 1), ...(confession ? [step('confession', 'confession', 0)] : [])] : catalog('index');
        return shell(moduleId, known, steps, routes ? 1 + routes + confession : 1, routes ? 1 + routes + confession : null);
    }
    if (moduleId === 'butterfly') {
        if (known.phase === 'increment') {
            const prose = known.prose === 1 || known.prose === true ? [step('prose', 'prose', 1)] : [];
            return shell(moduleId, known, [step('divergences', 'divergences', 0), ...prose], 1 + prose.length, 2);
        }
        const axes = count(known.axes);
        if (axes === 0) return firstCatalog(moduleId, known, 'main');
        const prose = known.prose === 1 || known.prose === true ? [step('prose', 'prose', 0)] : [];
        const steps = axes ? [step('main', 'main', 0), ...numbered('branch', axes, 'branch', 1), step('omega', 'omega', 0), ...prose] : catalog('main');
        return shell(moduleId, known, steps, axes ? 2 + axes + prose.length : 1, axes ? 2 + axes + prose.length : null);
    }
    if (moduleId === 'pastLives') {
        const dossiers = count(known.dossiers);
        const prose = known.prose === 1 || known.prose === true ? [step('prologue-prose', 'prose', 0)] : [];
        const steps = dossiers == null ? catalog('episode') : [step('prologue', 'prologue', 0), ...prose, ...numbered('dossier', dossiers, 'dossier', 1), step('echo', 'echo', 0)];
        return shell(moduleId, known, steps, dossiers == null ? 1 : 2 + dossiers + prose.length, dossiers == null ? null : 2 + dossiers + prose.length);
    }
    if (moduleId === 'heart') {
        const steps = ['dialogue', 'daily', 'fireflies', 'epilogue', 'spring', 'summer', 'autumn', 'winter'].map((id, index) => step(id, id === 'winter' ? 'season' : id, index));
        return shell(moduleId, known, steps, 8, 13);
    }
    return null;
}

export function expandModulePlan(plan, expand = {}) {
    if (!plan || plan.steps?.some(item => item.kind !== 'catalog' && item.status === 'completed')) return plan;
    const facts = {
        ...expand,
        drawId: plan.drawId,
        chatId: plan.chatId,
        archiveRevision: plan.archiveRevision,
        sourceMemoryIds: plan.sourceMemoryIds,
        frozenAt: plan.frozenAt,
    };
    const built = buildModulePlan(plan.moduleId, facts);
    if (!built || built.steps.some(item => item.kind === 'catalog') && built.steps.length === 1 && plan.steps.length === 1) return built && built.steps.length > 1 ? built : null;
    if (!built) return null;
    const catalogStep = plan.steps.find(item => item.kind === 'catalog');
    const kept = catalogStep ? [{ ...catalogStep, status: 'completed', recoverySlot: catalogStep.recoverySlot || 'catalog' }] : [];
    const rest = built.steps.filter(item => !kept.some(done => done.id === item.id));
    return { ...built, steps: [...kept, ...rest].map((item, index) => ({ ...item, order: index })) };
}

export function concurrentSteps(steps) {
    const pending = (Array.isArray(steps) ? steps : []).filter(item => item && item.status !== 'completed');
    if (!pending.length || pending[0].kind !== 'app') return pending.slice(0, 1);
    const lastId = pending[pending.length - 1].id;
    const parallel = [];
    for (const item of pending) {
        if (item.kind !== 'app' || item.id === lastId) break;
        parallel.push(item);
        if (parallel.length === PHONE_APP_CONCURRENCY) break;
    }
    return parallel.length ? parallel : pending.slice(0, 1);
}

export function addRoomRepair(plan) {
    const repairs = (plan?.steps || []).filter(item => item.kind === 'repair');
    if (!plan || repairs.length >= ROOM_REPAIR_LIMIT) return plan;
    const order = plan.steps.length;
    return {
        ...plan,
        steps: [...plan.steps, step(`repair-${repairs.length + 1}`, 'repair', order)],
        expectedRequestRange: { min: plan.expectedRequestRange.min, max: (plan.expectedRequestRange.max || plan.steps.length) + 1 },
    };
}
