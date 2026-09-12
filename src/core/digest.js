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
