const TOKEN_METER_STORAGE_KEY = 'rabbit_mirror_theater:token_meter:v1';
export const TOKEN_METER_EVENT = 'rabbit-mirror-token-meter-update';

function safeInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function isCjkLikeCodePoint(codePoint) {
    return (
        (codePoint >= 0x3400 && codePoint <= 0x4DBF)
        || (codePoint >= 0x4E00 && codePoint <= 0x9FFF)
        || (codePoint >= 0xF900 && codePoint <= 0xFAFF)
        || (codePoint >= 0x20000 && codePoint <= 0x3134F)
        || (codePoint >= 0x3040 && codePoint <= 0x30FF)
        || (codePoint >= 0x31F0 && codePoint <= 0x31FF)
        || (codePoint >= 0xAC00 && codePoint <= 0xD7AF)
    );
}

function isEmojiLikeCodePoint(codePoint) {
    return (
        (codePoint >= 0x1F000 && codePoint <= 0x1FAFF)
        || (codePoint >= 0x2600 && codePoint <= 0x27BF)
    );
}

function isAsciiWordCharacter(character) {
    return /[A-Za-z0-9_]/.test(character);
}

/**
 * Tokenizers differ across OpenAI, Claude, Gemini and local models. This meter
 * therefore reports a model-neutral estimate and a deliberately wider range.
 * Exact character counts remain authoritative.
 */
export function estimatePromptTokens(text) {
    const value = String(text || '');
    if (!value) {
        return Object.freeze({
            chars: 0,
            codePoints: 0,
            estimatedTokens: 0,
            minTokens: 0,
            maxTokens: 0,
            cjkChars: 0,
            asciiWordChars: 0,
            emojiChars: 0,
            otherChars: 0,
        });
    }

    let cjkChars = 0;
    let asciiWordChars = 0;
    let asciiWordRuns = 0;
    let emojiChars = 0;
    let punctuationChars = 0;
    let otherChars = 0;
    let whitespaceRuns = 0;
    let inAsciiWord = false;
    let inWhitespace = false;

    for (const character of value) {
        const codePoint = character.codePointAt(0) || 0;
        if (/\s/.test(character)) {
            if (!inWhitespace) whitespaceRuns += 1;
            inWhitespace = true;
            inAsciiWord = false;
            continue;
        }
        inWhitespace = false;

        if (isCjkLikeCodePoint(codePoint)) {
            cjkChars += 1;
            inAsciiWord = false;
            continue;
        }
        if (isAsciiWordCharacter(character)) {
            asciiWordChars += 1;
            if (!inAsciiWord) asciiWordRuns += 1;
            inAsciiWord = true;
            continue;
        }
        inAsciiWord = false;

        if (isEmojiLikeCodePoint(codePoint)) {
            emojiChars += 1;
        } else if (/[^\p{L}\p{N}]/u.test(character)) {
            punctuationChars += 1;
        } else {
            otherChars += 1;
        }
    }

    const asciiEstimate = asciiWordChars / 3.55 + asciiWordRuns * 0.18;
    const estimated = (
        cjkChars * 0.84
        + asciiEstimate
        + otherChars * 0.62
        + punctuationChars * 0.46
        + emojiChars * 1.85
        + whitespaceRuns * 0.12
    );
    const minimum = (
        cjkChars * 0.55
        + asciiWordChars / 4.6
        + otherChars * 0.38
        + punctuationChars * 0.24
        + emojiChars * 1.0
        + whitespaceRuns * 0.04
    );
    const maximum = (
        cjkChars * 1.16
        + asciiWordChars / 2.7
        + asciiWordRuns * 0.25
        + otherChars * 0.95
        + punctuationChars * 0.82
        + emojiChars * 3.0
        + whitespaceRuns * 0.2
    );

    const codePoints = [...value].length;
    const estimatedTokens = Math.max(1, Math.round(estimated));
    const minTokens = Math.max(1, Math.min(estimatedTokens, Math.floor(minimum)));
    const maxTokens = Math.max(estimatedTokens, Math.ceil(maximum));

    return Object.freeze({
        chars: value.length,
        codePoints,
        estimatedTokens,
        minTokens,
        maxTokens,
        cjkChars,
        asciiWordChars,
        emojiChars,
        otherChars: otherChars + punctuationChars,
    });
}

function readStoredRecord() {
    try {
        const raw = globalThis.localStorage?.getItem?.(TOKEN_METER_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function publishRecord(record) {
    globalThis.__rabbitMirrorLastTokenMeterRecord = record;
    try {
        globalThis.localStorage?.setItem?.(TOKEN_METER_STORAGE_KEY, JSON.stringify(record));
    } catch {
        // The live in-memory record remains available when storage is blocked.
    }
    try {
        if (typeof globalThis.CustomEvent === 'function' && typeof globalThis.dispatchEvent === 'function') {
            globalThis.dispatchEvent(new CustomEvent(TOKEN_METER_EVENT, { detail: record }));
        }
    } catch {
        // The settings panel can still read the stored/in-memory record later.
    }
    return record;
}

export function getLastRabbitMirrorTokenRecord() {
    const inMemory = globalThis.__rabbitMirrorLastTokenMeterRecord;
    if (inMemory && typeof inMemory === 'object') return inMemory;
    const stored = readStoredRecord();
    if (stored) globalThis.__rabbitMirrorLastTokenMeterRecord = stored;
    return stored;
}

export function recordRabbitMirrorInjection({
    prompt,
    basePrompt,
    generationType = 'normal',
    metadata = {},
} = {}) {
    const finalPrompt = String(prompt || '');
    const base = String(basePrompt || '');
    const suffix = finalPrompt.startsWith(base) ? finalPrompt.slice(base.length) : '';
    const totalTokens = estimatePromptTokens(finalPrompt);
    const baseTokens = estimatePromptTokens(base);
    const feedbackTokens = estimatePromptTokens(suffix);

    return publishRecord({
        version: 1,
        status: finalPrompt ? 'injected' : 'empty',
        recordedAt: Date.now(),
        generationType: String(generationType || 'normal'),
        chars: Object.freeze({
            total: finalPrompt.length,
            base: base.length,
            feedback: suffix.length,
            motherLibrary: safeInteger(metadata.motherLibraryChars),
            sharedMemory: safeInteger(metadata.memoryChars),
            selectedThemes: safeInteger(metadata.selectedThemeChars),
            selectedFormats: safeInteger(metadata.selectedFormatChars),
            // 1.3.69: 可编辑视觉层是用户唯一能直接把 Prompt 撑大的部分（上限 5000+1000+1000），
            // 此前只在 promptBuilder 的 metadata 里算了却从未进入统计口径，用户看不到自己的开销。
            editableVisual: safeInteger(metadata.editableVisualChars),
        }),
        tokens: Object.freeze({
            estimated: totalTokens.estimatedTokens,
            min: totalTokens.minTokens,
            max: totalTokens.maxTokens,
            baseEstimated: baseTokens.estimatedTokens,
            feedbackEstimated: feedbackTokens.estimatedTokens,
        }),
        rawPolicy: String(metadata.rawPolicy || ''),
        samplingMode: String(metadata.samplingMode || ''),
        themeIds: Array.isArray(metadata.themeIds) ? metadata.themeIds.slice(0, 8) : [],
        formatIds: Array.isArray(metadata.formatIds) ? metadata.formatIds.slice(0, 8) : [],
        visualScenery: !!metadata.visualSceneryMode,
        tarotRules: !!metadata.tarotRules,
        touchTheaterRules: !!metadata.touchTheaterRules,
    });
}


export function recordRabbitMirrorIndependentPrompt({
    extensionPrompt,
    basePrompt,
    feedbackPrompt = '',
    executionLock = '',
    contextChars = 0,
    metadata = {},
} = {}) {
    const finalPrompt = String(extensionPrompt || '');
    const base = String(basePrompt || '');
    const feedback = String(feedbackPrompt || '');
    const lock = String(executionLock || '');
    const totalTokens = estimatePromptTokens(finalPrompt);
    const baseTokens = estimatePromptTokens(base);
    const feedbackTokens = estimatePromptTokens(feedback);
    const lockTokens = estimatePromptTokens(lock);

    return publishRecord({
        version: 2,
        status: finalPrompt ? 'independent' : 'empty',
        recordedAt: Date.now(),
        generationType: 'independent',
        chars: Object.freeze({
            total: finalPrompt.length,
            base: base.length,
            feedback: feedback.length,
            executionLock: lock.length,
            independentContext: safeInteger(contextChars),
            motherLibrary: safeInteger(metadata.motherLibraryChars),
            sharedMemory: safeInteger(metadata.memoryChars),
            selectedThemes: safeInteger(metadata.selectedThemeChars),
            selectedFormats: safeInteger(metadata.selectedFormatChars),
            editableVisual: safeInteger(metadata.editableVisualChars),
        }),
        tokens: Object.freeze({
            estimated: totalTokens.estimatedTokens,
            min: totalTokens.minTokens,
            max: totalTokens.maxTokens,
            baseEstimated: baseTokens.estimatedTokens,
            feedbackEstimated: feedbackTokens.estimatedTokens,
            executionLockEstimated: lockTokens.estimatedTokens,
        }),
        rawPolicy: String(metadata.rawPolicy || ''),
        samplingMode: String(metadata.samplingMode || ''),
        themeIds: Array.isArray(metadata.themeIds) ? metadata.themeIds.slice(0, 8) : [],
        formatIds: Array.isArray(metadata.formatIds) ? metadata.formatIds.slice(0, 8) : [],
        visualScenery: !!metadata.visualSceneryMode,
        tarotRules: !!metadata.tarotRules,
        touchTheaterRules: !!metadata.touchTheaterRules,
    });
}

export function recordRabbitMirrorNoInjection(reason = 'cleared', generationType = '') {
    return publishRecord({
        version: 1,
        status: 'not_injected',
        recordedAt: Date.now(),
        generationType: String(generationType || ''),
        reason: String(reason || 'cleared'),
        chars: Object.freeze({ total: 0, base: 0, feedback: 0, motherLibrary: 0, sharedMemory: 0, selectedThemes: 0, selectedFormats: 0, editableVisual: 0 }),
        tokens: Object.freeze({ estimated: 0, min: 0, max: 0, baseEstimated: 0, feedbackEstimated: 0 }),
        rawPolicy: '',
        samplingMode: '',
        themeIds: [],
        formatIds: [],
        visualScenery: false,
        tarotRules: false,
        touchTheaterRules: false,
    });
}
