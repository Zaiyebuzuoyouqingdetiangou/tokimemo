// SHA-256 for content identity, including HTTP LAN hosts where SubtleCrypto is
// unavailable. No credentials, network, dependency download or weaker hash fallback.
let roundConstants;
let initialWords;
function constants() {
    if (roundConstants) return;
    const primes = [];
    for (let n = 2; primes.length < 64; n++) {
        if (!primes.some(p => p * p <= n && n % p === 0)) primes.push(n);
    }
    const fraction = value => Math.floor((value - Math.floor(value)) * 0x100000000) >>> 0;
    roundConstants = primes.map(n => fraction(Math.cbrt(n)));
    initialWords = primes.slice(0, 8).map(n => fraction(Math.sqrt(n)));
}
const rotate = (n, bits) => (n >>> bits) | (n << (32 - bits));
export function sha256Bytes(bytes) {
    constants();
    const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
    padded.set(bytes); padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(bytes.length / 0x20000000));
    view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0);
    const hash = initialWords.slice(), words = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
            const x = words[i - 15], y = words[i - 2];
            words[i] = (words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + words[i - 7]
                + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>> 0;
        }
        let [a,b,c,d,e,f,g,h] = hash;
        for (let i = 0; i < 64; i++) {
            const one = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + roundConstants[i] + words[i]) >>> 0;
            const two = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            h=g; g=f; f=e; e=(d+one)>>>0; d=c; c=b; b=a; a=(one+two)>>>0;
        }
        [a,b,c,d,e,f,g,h].forEach((value, i) => { hash[i] = (hash[i] + value) >>> 0; });
    }
    return hash.map(value => value.toString(16).padStart(8, '0')).join('');
}
export async function sha256Text(input) {
    const bytes = new TextEncoder().encode(input);
    if (globalThis.crypto?.subtle) {
        try {
            const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
            return [...new Uint8Array(result)].map(value => value.toString(16).padStart(2, '0')).join('');
        } catch { /* Some host webviews expose the API but reject its use. */ }
    }
    return sha256Bytes(bytes);
}
// Same SHA-256, fed in pieces. A caller can hash a long text in slices (and
// yield between them) or fork the state to finish two texts sharing a prefix.
// Output is byte-identical to sha256Bytes over the concatenated input.
function compressBlock(hash, words, bytes, offset) {
    for (let i = 0; i < 16; i++) {
        const at = offset + i * 4;
        words[i] = ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
        const x = words[i - 15], y = words[i - 2];
        words[i] = (words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + words[i - 7]
            + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = hash;
    for (let i = 0; i < 64; i++) {
        const one = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + roundConstants[i] + words[i]) >>> 0;
        const two = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h=g; g=f; f=e; e=(d+one)>>>0; d=c; c=b; b=a; a=(one+two)>>>0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0; hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0; hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
}
export function createSha256(from = null) {
    constants();
    const hash = from ? from.hash.slice() : initialWords.slice();
    const buffer = new Uint8Array(64);
    if (from) buffer.set(from.buffer);
    let used = from ? from.used : 0, length = from ? from.length : 0;
    const words = new Uint32Array(64);
    const self = {
        get hash() { return hash; }, get buffer() { return buffer; }, get used() { return used; }, get length() { return length; },
        update(bytes) {
            let offset = 0;
            length += bytes.length;
            if (used) {
                const take = Math.min(64 - used, bytes.length);
                buffer.set(bytes.subarray(0, take), used); used += take; offset = take;
                if (used < 64) return self;
                compressBlock(hash, words, buffer, 0); used = 0;
            }
            for (; offset + 64 <= bytes.length; offset += 64) compressBlock(hash, words, bytes, offset);
            if (offset < bytes.length) { buffer.set(bytes.subarray(offset), 0); used = bytes.length - offset; }
            return self;
        },
        updateText(value) { return self.update(new TextEncoder().encode(value)); },
        fork() { return createSha256(self); },
        hex() {
            const tail = createSha256(self), total = length;
            const padLength = ((used + 9 + 63) & ~63) - used;
            const pad = new Uint8Array(padLength); pad[0] = 0x80;
            const view = new DataView(pad.buffer);
            view.setUint32(padLength - 8, Math.floor(total / 0x20000000));
            view.setUint32(padLength - 4, (total * 8) >>> 0);
            tail.update(pad);
            return tail.hash.map(value => value.toString(16).padStart(8, '0')).join('');
        },
    };
    return self;
}
