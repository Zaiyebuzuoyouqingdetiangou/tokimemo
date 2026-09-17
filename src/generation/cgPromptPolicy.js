// Request-bound format selection. Legacy recovery journals keep their exact old
// prompt hashes; new tasks record only the two-value UI choice, never content.
import * as format from '../core/cgPromptFormat.js';
const bindings = new WeakMap();
export function bindCgPromptFormat(origin, value, dialect = 'r8413') {
    if (origin && typeof origin === 'object') bindings.set(origin, { selected: format.normalizeCgPromptFormat(value), dialect });
}
export function cgPromptForSegment(prompt, options) {
    const binding = options?.origin && bindings.get(options.origin);
    return binding?.selected && format.cgFieldSegment(options.mode, options.taskKey)
        ? prompt + (binding.dialect === 'r8413' ? format.cgFormatFieldDirective : format.legacyCgFormatFieldDirective)(binding.selected) : prompt;
}
export function cgRecoveryOperation(mode, operation, existing, selected) {
    if (!format.cgOperationHasImageFields(mode, operation)) return operation;
    const value = existing ? format.normalizeCgPromptFormat(existing.operation?.cgPromptFormat) : format.normalizeCgPromptFormat(selected);
    const { cgPromptFormat: ignored, cgPromptDialect: ignoredDialect, ...base } = operation;
    const dialect = existing ? existing.operation?.cgPromptDialect : 'r8413';
    return value ? { ...base, cgPromptFormat: value, ...(dialect === 'r8413' ? { cgPromptDialect: dialect } : {}) } : base;
}

export function cgSegmentValidator(validator, options) {
    const binding = options?.origin && bindings.get(options.origin);
    if (!binding?.selected || binding.dialect !== 'r8413' || !format.cgFieldSegment(options.mode, options.taskKey)) return validator;
    const check = result => {
        const rows = Array.isArray(result) ? result
            : options.mode === 'album' ? result?.entries : options.mode === 'adv' ? result?.events : result?.dailyStrips;
        // Check only content accepted by the original per-item validator. An invalid
        // sibling which that validator discards must not veto already usable works.
        if (Array.isArray(rows)) for (const item of rows) {
            if (typeof item?.imagePrompt !== 'string' || !item.imagePrompt.trim()) continue;
            if (binding.selected === 'nai45-tags') format.assertEnglishTagPrompt(item.imagePrompt);
            else format.assertNaturalScenePrompt(item.imagePrompt);
        }
        return result;
    };
    return raw => {
        const result = validator(raw);
        return result && typeof result.then === 'function' ? result.then(check) : check(result);
    };
}
