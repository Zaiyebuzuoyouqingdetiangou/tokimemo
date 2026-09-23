import * as letterIllustration from './letterIllustration.js';

// The album is a view over saved letters, not a second copy of the artwork.
// Receiving, importing, reopening, and adding old mail all update it naturally.
export function savedMailDrawings(session) {
    const seen = new Set();
    return (Array.isArray(session?.letters) ? session.letters : []).filter(letter => {
        if (!letter?.id || seen.has(letter.id) || !letterIllustration.normalizeLetterIllustration(letter.illustration)) return false;
        seen.add(letter.id);
        return true;
    });
}
