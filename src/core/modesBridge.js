// 重构清单 C-3（r84.98）：core 层不再直接 import modes 层。
// 下面这些玩法函数由各自的 modes 文件在加载时登记进来（见各文件末尾的 registerModesBridge），
// core 调用时按名字转过去。还没登记就被调用，说明加载顺序出了问题，直接报错，不猜默认值。
const hooks = Object.create(null);

export function registerModesBridge(entries = {}) {
    for (const [name, fn] of Object.entries(entries)) if (typeof fn === 'function') hooks[name] = fn;
}

export function modesBridgeRegistered(name) { return typeof hooks[name] === 'function'; }

function call(name, args) {
    const fn = hooks[name];
    if (!fn) throw new Error(`心迹回廊内部错误：玩法函数 ${name} 尚未登记`);
    return fn(...args);
}

export function calendarEntryPageKey(...args) { return call('calendarEntryPageKey', args); }

export function migrateCalendarSession(...args) { return call('migrateCalendarSession', args); }

export function normalizePhonePlan(...args) { return call('normalizePhonePlan', args); }

export function normalizePhoneDraftApp(...args) { return call('normalizePhoneDraftApp', args); }

export function migrateLegacyPhoneSession(...args) { return call('migrateLegacyPhoneSession', args); }

export function mergeInboxLatest(...args) { return call('mergeInboxLatest', args); }

export function normalizeInboxSession(...args) { return call('normalizeInboxSession', args); }

export function readablePastLivesProgressSession(...args) { return call('readablePastLivesProgressSession', args); }

export function readablePastLivesSession(...args) { return call('readablePastLivesSession', args); }

export function readableTimeStoriesProgressSession(...args) { return call('readableTimeStoriesProgressSession', args); }

export function readableTimeStoriesSession(...args) { return call('readableTimeStoriesSession', args); }

export function readableThemeSongProgressSession(...args) { return call('readableThemeSongProgressSession', args); }

export function readableBedtimeProgressSession(...args) { return call('readableBedtimeProgressSession', args); }

export function renderRoom(...args) { return call('renderRoom', args); }

export function mergeDeferredHeartPatches(...args) { return call('mergeDeferredHeartPatches', args); }
