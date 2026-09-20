// Lossless storage representation only. Never rebuild requests from current settings.
// Callers validate own JSON data before invoking this codec.
const has = (value, key) => Object.hasOwn(value, key);
const size = value => JSON.stringify(value).length;
const invalid = () => { throw new Error('Invalid recovery payload encoding'); };
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => has(value, key));

function spliceFrom(base, actual) {
    let prefixChars = 0, suffixChars = 0;
    while (prefixChars < base.length && prefixChars < actual.length && base[prefixChars] === actual[prefixChars]) prefixChars++;
    while (suffixChars < base.length - prefixChars && suffixChars < actual.length - prefixChars
        && base[base.length - suffixChars - 1] === actual[actual.length - suffixChars - 1]) suffixChars++;
    const patch = { prefixChars, removeChars: base.length - prefixChars - suffixChars,
        insertText: actual.slice(prefixChars, actual.length - suffixChars) };
    return size(patch) < size(actual) ? patch : actual;
}

export function packRecoveryPayload(journal) {
    if (!journal || typeof journal !== 'object' || has(journal, 'requestEncoding') || has(journal, 'requestContextTable')) return journal;
    const plain = { ...journal };
    if (Array.isArray(journal.previousAttempts)) plain.previousAttempts = journal.previousAttempts.map(packRecoveryPayload);
    if (!Array.isArray(plain.segments)) return plain;
    const table = [], indexes = new Map();
    const segments = plain.segments.map(segment => {
        const recipe = segment.requestRecipe, identity = recipe?.identity;
        if (recipe?.version !== 1 || typeof identity?.contextEnvelope !== 'string' || typeof identity.prompt !== 'string') return segment;
        const context = identity.contextEnvelope;
        let storedContext = context;
        if (context) {
            if (!indexes.has(context)) { indexes.set(context, table.length); table.push(context); }
            storedContext = { textRef: indexes.get(context) };
        }
        return { ...segment, requestRecipe: { ...recipe, identity: { ...identity, contextEnvelope: storedContext },
            ...(typeof recipe.actualPrompt === 'string' ? { actualPrompt: spliceFrom(context + '\n' + identity.prompt, recipe.actualPrompt) } : {}) } };
    });
    const packed = { ...plain, segments, requestEncoding: 1, requestContextTable: table };
    // No new size threshold: keep whichever representation actually occupies less space.
    return size(packed) < size(plain) ? packed : plain;
}

export function unpackRecoveryPayload(journal, requestChars) {
    if (!journal || typeof journal !== 'object') return journal;
    const decoded = { ...journal };
    if (Array.isArray(journal.previousAttempts)) decoded.previousAttempts = journal.previousAttempts.map(value => unpackRecoveryPayload(value, requestChars));
    if (!has(journal, 'requestEncoding') && !has(journal, 'requestContextTable')) return decoded;
    if (journal.requestEncoding !== 1 || !Array.isArray(journal.requestContextTable) || !Array.isArray(journal.segments)) invalid();
    const table = journal.requestContextTable;
    if (table.some(value => typeof value !== 'string' || value.length > requestChars)) invalid();
    decoded.segments = journal.segments.map(segment => {
        const recipe = segment.requestRecipe;
        if (!recipe) return segment;
        const identity = recipe.identity;
        if (!identity || typeof identity.prompt !== 'string') invalid();
        let context = identity.contextEnvelope;
        if (typeof context !== 'string') {
            if (!exactKeys(context, ['textRef']) || !Number.isSafeInteger(context.textRef)
                || context.textRef < 0 || context.textRef >= table.length) invalid();
            context = table[context.textRef];
        }
        let actual = recipe.actualPrompt;
        if (actual !== undefined && typeof actual !== 'string') {
            if (!exactKeys(actual, ['prefixChars', 'removeChars', 'insertText']) || typeof actual.insertText !== 'string'
                || !Number.isSafeInteger(actual.prefixChars) || !Number.isSafeInteger(actual.removeChars)
                || actual.prefixChars < 0 || actual.removeChars < 0) invalid();
            const base = context + '\n' + identity.prompt;
            if (actual.prefixChars > base.length || actual.removeChars > base.length - actual.prefixChars
                || base.length - actual.removeChars + actual.insertText.length > requestChars) invalid();
            actual = base.slice(0, actual.prefixChars) + actual.insertText + base.slice(actual.prefixChars + actual.removeChars);
        }
        return { ...segment, requestRecipe: { ...recipe, identity: { ...identity, contextEnvelope: context },
            ...(has(recipe, 'actualPrompt') ? { actualPrompt: actual } : {}) } };
    });
    delete decoded.requestEncoding;
    delete decoded.requestContextTable;
    return decoded;
}
