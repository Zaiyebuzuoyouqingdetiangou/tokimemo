// Page code never overrides the user's temperature. Cold judgement/evidence
// steps may only lower it through a ceiling.
export function resolveRequestTemperature(options = {}, settings = {}) {
    const user = Number.isFinite(Number(settings.temperature)) ? Number(settings.temperature) : 0.9;
    const explicit = Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : null;
    const base = explicit ?? user;
    const ceiling = Number(options.temperatureCeiling);
    return Number.isFinite(ceiling) ? Math.min(base, ceiling) : base;
}
