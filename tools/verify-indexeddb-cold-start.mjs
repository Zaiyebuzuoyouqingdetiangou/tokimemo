import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath();
const runId = `r49-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const server = http.createServer(async (request, response) => {
    try {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        if (url.pathname === '/') {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end('<!doctype html><meta charset="utf-8"><title>Heartbeat IDB durability check</title>');
            return;
        }
        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const target = path.resolve(repoRoot, relative);
        if (target !== repoRoot && !target.startsWith(`${repoRoot}${path.sep}`)) {
            response.statusCode = 403;
            response.end('forbidden');
            return;
        }
        const source = await readFile(target);
        response.setHeader('Content-Type', target.endsWith('.js') || target.endsWith('.mjs')
            ? 'text/javascript; charset=utf-8'
            : 'application/octet-stream');
        response.setHeader('Cache-Control', 'no-store');
        response.end(source);
    } catch {
        response.statusCode = 404;
        response.end('not found');
    }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, executablePath });
const browserContext = await browser.newContext();

const entry = {
    entryId: `AE:${runId}`,
    characterKey: `avatar:${runId}`,
    avatar: `${runId}.png`,
    characterName: '冷启动角色',
    characterFingerprint: `fingerprint:${runId}`,
    characterIndexHint: 7,
    chatId: `${runId}.jsonl`,
    archiveName: '冷启动档案',
};
const memory = {
    version: 3,
    chatId: entry.chatId,
    characterName: entry.characterName,
    userName: '冷启动用户',
    archiveName: entry.archiveName,
    archiveRevision: `revision:${runId}`,
    createdAt: 100,
    updatedAt: 200,
    memories: [{ id: 'M001', title: '真实持久化', summary: `BACKUP_SENTINEL:${runId}`, anchors: ['真实持久化'] }],
};
const cache = {
    chatId: entry.chatId,
    archiveRevision: memory.archiveRevision,
    commitToken: 1,
    updatedAt: 200,
    room: { kind: 'room', title: `CACHE_SENTINEL:${runId}` },
};
const scope = {
    characterKey: entry.characterKey,
    characterName: entry.characterName,
    chatId: entry.chatId,
};

async function openPage() {
    // A fresh page gives a fresh module realm while the shared browser context preserves the
    // same-origin IndexedDB databases, matching a real page reload/cold runtime start.
    const page = await browserContext.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    return page;
}

try {
    const firstPage = await openPage();
    const first = await firstPage.evaluate(async ({ entry, memory, cache, scope, runId }) => {
        const backup = await import(`/src/archive/backupStore.js?writer=${encodeURIComponent(runId)}`);
        const ledger = await import(`/src/archive/sourceLedger.js?writer=${encodeURIComponent(runId)}`);
        backup.setArchiveBackupBackendForTests(null);
        ledger.setMemorySourceLedgerBackendForTests(null);
        const seeded = await backup.seedArchiveBackup(entry, memory, cache);
        const upserted = await ledger.upsertMemorySourceLedger(scope, {
            provider: 'explicit-file-import',
            label: '显式导入',
            sourceKind: 'file',
            sourceKey: `file:${runId}`,
            providerVersion: '1',
            revision: `ledger:${runId}`,
            coverage: { status: 'complete', returned: 1, total: 1 },
            records: [{ sourceId: 'row-1', revision: '1', sourceHash: `hash:${runId}`, content: `LEDGER_SENTINEL:${runId}` }],
        });
        const backupState = await backup.readArchiveBackupState(entry);
        const backupRead = backupState.record;
        const ledgerRead = await ledger.readMemorySourceLedger(scope);
        return {
            backup: backupRead?.memory?.memories?.[0]?.summary,
            cache: backupRead?.cache?.room?.title,
            ledger: ledger.ledgerCurrentRecords(ledgerRead)?.[0]?.content,
            seededEntryId: seeded?.entryId,
            seededChatId: seeded?.chatId,
            backupState,
            upserted,
        };
    }, { entry, memory, cache, scope, runId });
    await firstPage.close();

    const secondPage = await openPage();
    const second = await secondPage.evaluate(async ({ entry, scope, runId }) => {
        const backup = await import(`/src/archive/backupStore.js?cold=${encodeURIComponent(runId)}`);
        const ledger = await import(`/src/archive/sourceLedger.js?cold=${encodeURIComponent(runId)}`);
        const backupRead = await backup.readArchiveBackup(entry);
        const ledgerRead = await ledger.readMemorySourceLedger(scope);
        const beforeDelete = {
            backup: backupRead?.memory?.memories?.[0]?.summary,
            cache: backupRead?.cache?.room?.title,
            ledger: ledger.ledgerCurrentRecords(ledgerRead)?.[0]?.content,
        };
        await backup.deleteArchiveBackup(entry);
        await ledger.deleteMemorySourceLedger(scope);
        return beforeDelete;
    }, { entry, scope, runId });
    await secondPage.close();

    const thirdPage = await openPage();
    const deleted = await thirdPage.evaluate(async ({ entry, scope, runId }) => {
        const backup = await import(`/src/archive/backupStore.js?deleted=${encodeURIComponent(runId)}`);
        const ledger = await import(`/src/archive/sourceLedger.js?deleted=${encodeURIComponent(runId)}`);
        return {
            backup: await backup.readArchiveBackupState(entry),
            ledger: await ledger.readMemorySourceLedger(scope),
        };
    }, { entry, scope, runId });
    await thirdPage.close();

    const expected = {
        backup: `BACKUP_SENTINEL:${runId}`,
        cache: `CACHE_SENTINEL:${runId}`,
        ledger: `LEDGER_SENTINEL:${runId}`,
    };
    const firstValues = { backup: first.backup, cache: first.cache, ledger: first.ledger };
    assert.deepEqual(firstValues, expected);
    assert.deepEqual(second, expected);
    assert.equal(deleted.backup.deleted, true);
    assert.equal(deleted.backup.record, null);
    assert.equal(deleted.ledger, null);
    console.log(JSON.stringify({
        ok: true,
        engine: 'Edge/Chromium IndexedDB',
        firstWriteRead: true,
        freshPageColdRead: true,
        deletionFenceColdRead: true,
        sourceLedgerColdDelete: true,
    }, null, 2));
} finally {
    await browserContext.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
