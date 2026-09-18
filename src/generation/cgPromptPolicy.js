import * as visual from '../core/cgVisualRules.js';
// Request-bound format selection. Legacy recovery journals keep their exact old
// prompt hashes; new tasks record only the two-value UI choice, never content.
import * as format from '../core/cgPromptFormat.js';
const bindings = new WeakMap();
export function bindCgPromptFormat(origin, value, dialect = 'r8420') {
    if (origin && typeof origin === 'object') bindings.set(origin, { selected: format.normalizeCgPromptFormat(value), dialect });
}
export function cgPromptForSegment(prompt, options) {
    const binding = options?.origin && bindings.get(options.origin);
    if (!binding?.selected || !format.cgFieldSegment(options.mode, options.taskKey)) return prompt;
    if (binding.dialect === 'r8420') return prompt + visual.cgInitialVisualInstructions(binding.selected, options.mode === 'heart');
    return prompt + (binding.dialect === 'r8413' ? format.cgFormatFieldDirective : format.legacyCgFormatFieldDirective)(binding.selected);
}
export function cgRecoveryOperation(mode, operation, existing, selected) {
    if (!format.cgOperationHasImageFields(mode, operation)) return operation;
    const value = existing ? format.normalizeCgPromptFormat(existing.operation?.cgPromptFormat) : format.normalizeCgPromptFormat(selected);
    const { cgPromptFormat: ignored, cgPromptDialect: ignoredDialect, ...base } = operation;
    const dialect = existing ? existing.operation?.cgPromptDialect : 'r8420';
    return value ? { ...base, cgPromptFormat: value, ...(['r8413', 'r8420'].includes(dialect) ? { cgPromptDialect: dialect } : {}) } : base;
}

export function cgSegmentValidator(validator, options) {
    // The original domain validator still owns fields, evidence and per-item
    // acceptance. Dialect instructions are attached by cgPromptForSegment;
    // a model's different imagePrompt wording must not discard valid content.
    return validator;
}
