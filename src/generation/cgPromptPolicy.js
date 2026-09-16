// Request-bound format selection. Legacy recovery journals keep their exact old
// prompt hashes; new tasks record only the two-value UI choice, never content.
import * as format from '../core/cgPromptFormat.js';
const bindings = new WeakMap();
export function bindCgPromptFormat(origin, value) {
    if (origin && typeof origin === 'object') bindings.set(origin, format.normalizeCgPromptFormat(value));
}
export function cgPromptForSegment(prompt, options) {
    const selected = options?.origin && bindings.get(options.origin);
    return selected && format.cgFieldSegment(options.mode, options.taskKey)
        ? prompt + format.cgFormatFieldDirective(selected) : prompt;
}
export function cgRecoveryOperation(mode, operation, existing, selected) {
    if (!format.cgOperationHasImageFields(mode, operation)) return operation;
    const value = existing ? format.normalizeCgPromptFormat(existing.operation?.cgPromptFormat) : format.normalizeCgPromptFormat(selected);
    const { cgPromptFormat: ignored, ...base } = operation;
    return value ? { ...base, cgPromptFormat: value } : base;
}
