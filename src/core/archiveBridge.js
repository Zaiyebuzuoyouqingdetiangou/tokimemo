// 重构清单 C-3c（r84.100 起）：core 层不再直接 import archive 层。
// 下面这些档案层函数由各自的 archive 文件在加载时登记进来（见各文件末尾的 registerArchiveBridge），
// core 调用时按名字转过去。还没登记就被调用，说明加载顺序出了问题，直接报错，不猜默认值。
// 分两轮完成：r84.100 做了前一半（11 个 import 行），r84.101 做了后一半（12 行）。
const hooks = Object.create(null);

export function registerArchiveBridge(entries = {}) {
    for (const [name, fn] of Object.entries(entries)) if (typeof fn === 'function') hooks[name] = fn;
}

export function archiveBridgeRegistered(name) { return typeof hooks[name] === 'function'; }

function call(name, args) {
    const fn = hooks[name];
    if (!fn) throw new Error(`心迹回廊内部错误：档案函数 ${name} 尚未登记`);
    return fn(...args);
}

export function getImportedMemory(...args) { return call('getImportedMemory', args); }

export function importCurrentChatMemory(...args) { return call('importCurrentChatMemory', args); }

export function requireArchive(...args) { return call('requireArchive', args); }

export function getMemoryWorldInfoSelection(...args) { return call('getMemoryWorldInfoSelection', args); }

export function boundedSourceRead(...args) { return call('boundedSourceRead', args); }

export function waitForSourceRead(...args) { return call('waitForSourceRead', args); }

export function scheduleChooserRefresh(...args) { return call('scheduleChooserRefresh', args); }

export function migrateDerivedCacheRevision(...args) { return call('migrateDerivedCacheRevision', args); }

export function migrateArchiveInMemory(...args) { return call('migrateArchiveInMemory', args); }

export function archiveDeletionFenceKey(...args) { return call('archiveDeletionFenceKey', args); }

export function readArchiveBackupState(...args) { return call('readArchiveBackupState', args); }

export function replaceArchiveBackup(...args) { return call('replaceArchiveBackup', args); }

export function seedArchiveBackup(...args) { return call('seedArchiveBackup', args); }

export function updateArchiveBackupCache(...args) { return call('updateArchiveBackupCache', args); }

export function currentCharacterArchiveDeletionFence(...args) { return call('currentCharacterArchiveDeletionFence', args); }

export function restoreCurrentCharacterArchiveVisibility(...args) { return call('restoreCurrentCharacterArchiveVisibility', args); }

export function upsertArchiveIndex(...args) { return call('upsertArchiveIndex', args); }

export function currentCharacterArchiveProbe(...args) { return call('currentCharacterArchiveProbe', args); }

export function getArchiveIndex(...args) { return call('getArchiveIndex', args); }

export function isCurrentCharacterDeletedFromLibrary(...args) { return call('isCurrentCharacterDeletedFromLibrary', args); }

export function rememberCurrentArchiveForOverview(...args) { return call('rememberCurrentArchiveForOverview', args); }

export function syncArchiveOverviewCurrentRow(...args) { return call('syncArchiveOverviewCurrentRow', args); }
