// Strict JSON pages stay at or below 0.4. Colder page values are kept.
export function jsonPageTemperature(requested, fallback = 0.4) {
    const value = Number.isFinite(Number(requested)) ? Number(requested) : Number(fallback);
    return Math.min(Number.isFinite(value) ? value : 0.4, 0.4);
}
