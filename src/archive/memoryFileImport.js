// Local memory-file parser.  Files are treated strictly as inert text/data: no HTML
// rendering, macro expansion, script execution, fetch, or instruction interpretation.
import * as core_constants from '../core/constants.js';
import * as core_text from '../core/text.js';
import * as archive_sourceLedger from './sourceLedger.js';

const ALLOWED_EXTENSIONS = new Set(['json', 'jsonl', 'txt', 'md', 'markdown']);
const SENSITIVE_FIELD = /^(?:api[_-]?key|authorization|proxy[_-]?password|password|passphrase|secret|client[_-]?secret|token|auth[_-]?token|access[_-]?token|refresh[_-]?token|bearer[_-]?token|cookie|session[_-]?token|credential)$/i;
const SENSITIVE_VALUE = /^(?:bearer\s+[a-z0-9._~+/=-]{8,}|sk-[a-z0-9_-]{8,}|gh[oprsu]_[a-z0-9]{12,}|AIza[a-z0-9_-]{20,}|eyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,})$/i;
const CONFIG_CONTAINER = /^(?:settings?|configs?|configuration|preferences?|options?|credentials?|auth|authentication|connection)$/i;
const CONFIG_FIELD = /^(?:endpoint|base[_-]?url|api[_-]?url|server[_-]?url|model(?:[_-]?(?:id|name))?|temperature|max[_-]?tokens?|enabled|disabled)$/i;

function extensionOf(name) {
    const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1] || '';
}

function stableHash(value) {
    const text = String(value ?? '');
    return `${core_text.hashString(text).toString(36).replace('-', 'n')}${core_text.hashString(`${text.length}:${text.slice(0, 1024)}`).toString(36).replace('-', 'n')}`;
}

function inertText(value) {
    return String(value ?? '').replace(/\u0000/g, '').trim();
}

function extractObjectRecords(value, out = [], stats = { sensitive: 0, config: 0 }) {
    const contentKeys = ['content', 'summary', 'text', 'memory', 'mes'];
    const metadataKeys = new Set([
        'sourceId', 'externalId', 'id', 'uid', 'uuid', 'revision', 'version', 'updated_at', 'updatedAt',
        'type', 'category', 'role', 'date', 'timestamp', 'created_at', 'createdAt', 'title', 'name', 'comment',
    ]);
    const stack = [{ value, path: '$', configPath: false }];
    let visited = 0;
    while (stack.length) {
        const frame = stack.pop();
        const current = frame?.value;
        const path = frame?.path || '$';
        const configPath = frame?.configPath === true;
        if (current == null) continue;
        visited += 1;
        if (visited > 100000) throw new Error('JSON 记忆文件结构过于复杂，已停止导入；没有把未读取分支标成完整。');
        if (out.length > core_constants.MAX_MEMORY_FILE_RECORDS) throw new Error('记忆文件超过 5000 条记录上限。');
        if (Array.isArray(current)) {
            for (let index = current.length - 1; index >= 0; index -= 1) {
                stack.push({ value: current[index], path: `${path}[${index}]`, configPath });
            }
            continue;
        }
        if (typeof current === 'string') {
            const content = inertText(current);
            if (content && SENSITIVE_VALUE.test(content)) stats.sensitive += 1;
            else if (content && configPath) stats.config += 1;
            else if (content) out.push({ content, type: 'json-string-field', title: path });
            continue;
        }
        if (typeof current !== 'object') continue;
        const contentKey = contentKeys.find(key => typeof current[key] === 'string');
        const contentValue = contentKey ? current[contentKey] : '';
        const content = inertText(contentValue ?? '');
        if (content && SENSITIVE_VALUE.test(content)) stats.sensitive += 1;
        else if (content && configPath) stats.config += 1;
        else if (content) {
            out.push({
                sourceId: archive_sourceLedger.normalizeMemorySourceId(current.sourceId ?? current.externalId ?? current.id ?? current.uid ?? current.uuid),
                revision: archive_sourceLedger.normalizeMemorySourceRevision(current.revision ?? current.version ?? current.updated_at ?? current.updatedAt),
                type: core_text.normalizeText(current.type ?? current.category ?? current.role, 80),
                date: core_text.normalizeText(current.date ?? current.timestamp ?? current.created_at ?? current.createdAt, 100),
                title: core_text.normalizeText(current.title ?? current.name ?? current.comment, 180),
                content,
            });
        }
        const children = [];
        for (const [key, child] of Object.entries(current)) {
            const childPath = `${path}.${key}`;
            const childConfigPath = configPath || CONFIG_CONTAINER.test(key);
            if (child && typeof child === 'object') children.push({ value: child, path: childPath, configPath: childConfigPath });
            // Unknown memory plugins frequently use their own history field names.
            // Import every non-metadata string leaf into the confirmation preview so
            // an unrecognized field is never silently omitted while coverage says complete.
            else if (typeof child === 'string' && key !== contentKey && !metadataKeys.has(key)) {
                const safeValue = inertText(child);
                if (SENSITIVE_FIELD.test(key) || SENSITIVE_VALUE.test(safeValue)) stats.sensitive += 1;
                else if (childConfigPath || CONFIG_FIELD.test(key)) stats.config += 1;
                else children.push({ value: child, path: childPath, configPath: false });
            }
        }
        for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
    }
    return out;
}

function splitPlainText(text, extension) {
    const raw = inertText(text);
    if (!raw) return [];
    const isMarkdown = extension === 'md' || extension === 'markdown';
    const sections = isMarkdown
        ? raw.split(/(?=^#{1,6}\s+)/m).map(inertText).filter(Boolean)
        : raw.split(/\n\s*(?:---+|={3,})\s*\n/g).map(inertText).filter(Boolean);
    const records = [];
    for (const section of sections.length ? sections : [raw]) {
        if (section.trim()) records.push({ content: section, type: isMarkdown ? 'markdown-memory' : 'text-memory' });
    }
    return records;
}

async function fileText(file) {
    if (typeof file?.text === 'function') return String(await file.text());
    if (typeof file?.content === 'string') return file.content;
    throw new Error('无法读取这个记忆文件。');
}

function byteLength(value) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(String(value)).byteLength;
    return new Blob([String(value)]).size;
}

export async function previewMemoryFile(file, binding) {
    const scope = archive_sourceLedger.normalizeMemorySourceScope(binding);
    const name = core_text.normalizeText(file?.name, 240) || 'memory.txt';
    const extension = extensionOf(name);
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('只支持 JSON、JSONL、TXT、MD、MARKDOWN 记忆文件。');
    const declaredBytes = Math.max(0, Number(file?.size) || 0);
    if (declaredBytes > core_constants.MAX_MEMORY_FILE_BYTES) throw new Error('记忆文件超过 4 MB 安全上限。');
    const text = await fileText(file);
    const actualBytes = byteLength(text);
    if (actualBytes > core_constants.MAX_MEMORY_FILE_BYTES) throw new Error('记忆文件超过 4 MB 安全上限。');
    let candidates = [];
    const parseStats = { sensitive: 0, config: 0 };
    if (extension === 'json') {
        let parsed;
        try { parsed = JSON.parse(text); } catch { throw new Error('JSON 记忆文件格式无效。'); }
        candidates = extractObjectRecords(parsed, [], parseStats);
    } else if (extension === 'jsonl') {
        const lines = text.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index].trim();
            if (!line) continue;
            let value;
            try { value = JSON.parse(line); } catch { throw new Error(`JSONL 第 ${index + 1} 行格式无效。`); }
            extractObjectRecords(value, candidates, parseStats);
            if (candidates.length > core_constants.MAX_MEMORY_FILE_RECORDS) break;
        }
    } else {
        candidates = splitPlainText(text, extension);
    }
    const records = [];
    const seen = new Set();
    let totalChars = 0;
    const fileHash = stableHash(text);
    const provider = archive_sourceLedger.normalizeMemorySourceProvider(`file:${name}`);
    for (let index = 0; index < candidates.length; index += 1) {
        if (records.length >= core_constants.MAX_MEMORY_FILE_RECORDS) throw new Error('记忆文件超过 5000 条记录上限。');
        const raw = candidates[index];
        const content = inertText(raw?.content);
        if (!content) continue;
        const contentHash = stableHash(content);
        const explicitSourceId = archive_sourceLedger.normalizeMemorySourceId(raw?.sourceId);
        const revision = archive_sourceLedger.normalizeMemorySourceRevision(raw?.revision) || fileHash;
        const type = core_text.normalizeText(raw?.type, 80) || 'imported-memory';
        const date = core_text.normalizeText(raw?.date, 100);
        const title = core_text.normalizeText(raw?.title, 180);
        const sourceId = explicitSourceId || `file:${name}:${index + 1}:${contentHash}`;
        // Equal prose is not necessarily the same event. Anonymous rows are always
        // preserved; only collapse a genuinely repeated explicit provider identity
        // with the same revision and content.
        const dedupeKey = explicitSourceId
            ? `id:${explicitSourceId}\u001frev:${revision}\u001fhash:${contentHash}`
            : `anonymous-record:${index}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        totalChars += content.length;
        if (totalChars > core_constants.MAX_MEMORY_FILE_CHARS) throw new Error('记忆文件文字超过 400 万字符上限。');
        records.push({
            provider,
            providerVersion: 'file-import-v1',
            sourceId,
            revision,
            sourceHash: contentHash,
            type,
            date,
            title,
            content,
        });
    }
    if (!records.length) throw new Error('文件中没有可导入的记忆文字。');
    const skippedFields = parseStats.sensitive + parseStats.config;
    const coverage = skippedFields
        ? {
            status: 'partial',
            returned: records.length,
            total: records.length + skippedFields,
            reason: `用户显式选择的本地文件；已安全排除 ${parseStats.sensitive} 个敏感字段和 ${parseStats.config} 个配置字段，未把它们送入账本或模型`,
        }
        : { status: 'complete', returned: records.length, total: records.length, reason: '用户显式选择的本地文件' };
    return {
        kind: 'heartbeat-memory-file-preview-v1',
        scope,
        fileName: name,
        extension,
        bytes: actualBytes,
        totalChars,
        skippedSensitiveFields: parseStats.sensitive,
        skippedConfigFields: parseStats.config,
        provider,
        label: `本地文件 · ${name}`,
        providerVersion: 'file-import-v1',
        revision: fileHash,
        coverage,
        records,
    };
}

export function assertMemoryFilePreviewBinding(preview, binding) {
    if (preview?.kind !== 'heartbeat-memory-file-preview-v1') throw new Error('请重新选择记忆文件并预览。');
    const expected = archive_sourceLedger.normalizeMemorySourceScope(binding);
    const actual = archive_sourceLedger.normalizeMemorySourceScope(preview.scope);
    if (expected.key !== actual.key) throw new Error('记忆文件预览属于另一个角色或聊天窗口，已拒绝导入。');
    return preview;
}
