// A local, read-only look at what an archive build is about to read, shown
// before anything is sent: how much text, roughly how many requests, which
// tags take up most of it, and which floors are unusually long (often another
// plugin's old summary pasted into the chat). Nothing here changes the chat,
// the settings or the archive.
import * as core_constants from '../core/constants.js';
import * as core_settings from '../core/settings.js';
import * as core_contextTags from '../core/contextTags.js';
import * as chat_read_range from '../core/chatReadRange.js';
import * as core_text from '../core/text.js';

// A tag is worth asking about when it holds a real share of the text.
const TAG_MIN_CHARS = 20000;
const TAG_MIN_SHARE = 0.15;
// A floor is "unusually long" against this chat's own typical floor.
const LONG_FLOOR_MIN_CHARS = 6000;
const LONG_FLOOR_FACTOR = 10;

function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function tagNames(text) {
    return [...core_contextTags.tagBlockSizes(text).keys()];
}

function preview(text) {
    const plain = String(text || '').replace(/<[^>]{0,200}>/g, ' ').replace(/\s+/g, ' ').trim();
    return Array.from(plain).slice(0, 48).join('') + (Array.from(plain).length > 48 ? '…' : '');
}

// Show the part that makes a floor long: the biggest tag block's opening text
// (usually the pasted summary), otherwise the floor's own beginning.
function bulkOf(text) {
    let best = '', size = 0;
    for (const [name, chars] of core_contextTags.tagBlockSizes(text)) {
        if (chars <= size) continue;
        size = chars;
        const start = text.search(new RegExp(`<\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s>/]`, 'i'));
        const open = start >= 0 ? text.indexOf('>', start) : -1;
        best = open >= 0 ? text.slice(open + 1, open + 400) : '';
    }
    return best || text;
}

// Async only to let the page breathe on very long chats; nothing is awaited from the network.
export async function estimateArchiveSource(context, settings = core_settings.getPluginSettings(context)) {
    const policy = core_contextTags.tagPolicyForContext(context);
    const rows = chat_read_range.selectChatReadRange(context, settings);
    const floors = [];
    const tags = new Map();
    let total = 0;
    let seen = 0;
    for (const row of rows) {
        if (++seen % 150 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        const text = core_contextTags.filterContextTags(String(row.message?.mes ?? ''), policy);
        if (!text.trim()) continue;
        floors.push({ index: row.index, chars: text.length, text });
        total += text.length;
        // Only tags still read under the current filter can be suggested.
        if (policy?.mode === 'keep') continue;
        for (const [name, size] of core_contextTags.tagBlockSizes(text)) {
            const entry = tags.get(name) || { name, chars: 0, floors: 0 };
            entry.chars += size; entry.floors += 1;
            tags.set(name, entry);
        }
    }
    const typical = median(floors.map(floor => floor.chars));
    const longLimit = Math.max(LONG_FLOOR_MIN_CHARS, typical * LONG_FLOOR_FACTOR);
    const longFloors = floors.filter(floor => floor.chars >= longLimit)
        .sort((a, b) => b.chars - a.chars).slice(0, 8)
        .map(floor => ({ index: floor.index, chars: floor.chars, preview: preview(bulkOf(floor.text)), tags: tagNames(floor.text).slice(0, 4) }))
        .sort((a, b) => a.index - b.index);
    const heavyTags = [...tags.values()]
        .filter(tag => tag.chars >= TAG_MIN_CHARS && total && tag.chars / total >= TAG_MIN_SHARE)
        .sort((a, b) => b.chars - a.chars).slice(0, 6)
        .map(tag => {
            const share = total ? tag.chars / total : 0;
            const floorShare = floors.length ? tag.floors / floors.length : 0;
            // Present in most floors: probably the story itself is wrapped in it.
            const likelyStory = floorShare >= 0.6;
            // A few floors carrying a large share is the typical pasted-summary shape.
            const likelySummary = !likelyStory && floorShare <= 0.25 && share >= 0.3;
            return { ...tag, share, likelyStory, likelySummary };
        });
    const requests = total ? Math.ceil(total / core_constants.IMPORT_CHUNK_CHARS) : 0;
    const batches = total ? Math.ceil(total / core_constants.ARCHIVE_BATCH_CHAT_CHARS) : 0;
    return { floors: floors.length, chars: total, requests, batches, typicalFloorChars: Math.round(typical),
        longFloors, longFloorCount: floors.filter(floor => floor.chars >= longLimit).length, heavyTags,
        tagMode: policy?.mode === 'keep' ? 'keep' : 'exclude' };
}

export function formatChars(value) {
    const chars = Math.max(0, Math.round(Number(value) || 0));
    return chars >= 10000 ? `${(chars / 10000).toFixed(chars >= 100000 ? 1 : 2).replace(/\.?0+$/, '')} 万字` : `${chars.toLocaleString()} 字`;
}

// Adds tags to the saved "don't read" list; keep mode is left to the settings page.
export function excludeTagsForArchive(names, context) {
    const chosen = core_contextTags.normalizeExcludedTags(names);
    if (!chosen.length) return false;
    const settings = core_settings.getPluginSettings(context);
    if (settings.contextTagMode === 'keep') return false;
    const current = core_contextTags.excludedTagsForContext(context);
    core_settings.updatePluginSettings({ excludedContextTags: [...new Set([...current, ...chosen])] });
    return true;
}

export const estimateText = estimate => core_text.normalizeText(
    `${estimate.floors} 层 · 约 ${formatChars(estimate.chars)} · 预计 ${estimate.requests} 次请求，分 ${estimate.batches} 批`, 200);
