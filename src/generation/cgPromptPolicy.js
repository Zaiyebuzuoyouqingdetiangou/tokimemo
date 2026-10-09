import * as character_scene from './cgCharacterScene.js';
import * as visual from '../core/cgVisualRules.js';
// Request-bound format selection. Legacy recovery journals keep their exact old
// prompt hashes; new tasks record only the two-value UI choice, never content.
import * as format from '../core/cgPromptFormat.js';
const bindings = new WeakMap();
export function bindCgPromptFormat(origin, value, dialect = 'r8420', looks = '', participantLooks = null) {
    if (origin && typeof origin === 'object') bindings.set(origin, { selected: format.normalizeCgPromptFormat(value), dialect,
        looks: typeof looks === 'string' ? looks : '', participantLooks: Array.isArray(participantLooks) ? structuredClone(participantLooks) : null });
}
export function cgPromptForSegment(prompt, options) {
    const binding = options?.origin && bindings.get(options.origin);
    if (!binding?.selected || !format.cgFieldSegment(options.mode, options.taskKey)) return prompt;
    if (binding.dialect === 'r84168-actions' || binding.dialect === 'r84166-actions') {
        const original = binding.dialect === 'r84168-actions'
            ? visual.cgParticipantVisualInstructions(binding.selected, options.mode, options.mode === 'heart' && /:(?:strip|strips)$/u.test(options.taskKey), binding.participantLooks || [])
            : ['album', 'adv'].includes(options.mode) || options.mode === 'heart' && /:(?:strip|strips)$/u.test(options.taskKey)
                ? visual.cgInitialVisualInstructionsV2(binding.selected, options.mode === 'heart', binding.looks)
                : visual.cgStoryVisualInstructionsV2(binding.selected, options.mode, binding.looks);
        return prompt + original + character_scene.cgCharacterSceneInstructions(binding.selected);
    }
    if (binding.dialect === 'r84168') return prompt + visual.cgParticipantVisualInstructions(binding.selected, options.mode,
        options.mode === 'heart' && /:(?:strip|strips)$/u.test(options.taskKey), binding.participantLooks || []);
    // r84.166：新任务。画面字段必写，并附用户确认的人物外貌（随任务冻结在 operation.cgCastLooks）。
    if (binding.dialect === 'r84166') return prompt + (['album', 'adv'].includes(options.mode) || options.mode === 'heart' && /:(?:strip|strips)$/u.test(options.taskKey)
        ? visual.cgInitialVisualInstructionsV2(binding.selected, options.mode === 'heart', binding.looks) : visual.cgStoryVisualInstructionsV2(binding.selected, options.mode, binding.looks));
    if (binding.dialect === 'r8483') return prompt + (['album', 'adv'].includes(options.mode) || options.mode === 'heart' && /:(?:strip|strips)$/u.test(options.taskKey)
        ? visual.cgInitialVisualInstructions(binding.selected, options.mode === 'heart') : visual.cgStoryVisualInstructions(binding.selected, options.mode));
    // Recovery journals created before r84.83 must keep their exact prompt hash.
    const legacySegment = options.mode === 'album' && /:(?:index|album)$/.test(options.taskKey)
        || options.mode === 'adv' && /:(?:index|event)$/.test(options.taskKey)
        || options.mode === 'heart' && /:(?:strip|strips)$/.test(options.taskKey);
    if (!legacySegment) return prompt;
    if (binding.dialect === 'r8420') return prompt + visual.cgInitialVisualInstructions(binding.selected, options.mode === 'heart');
    return prompt + (binding.dialect === 'r8413' ? format.cgFormatFieldDirective : format.legacyCgFormatFieldDirective)(binding.selected);
}
export function cgRecoveryOperation(mode, operation, existing, selected, castLooks = '', participantLooks = null) {
    if (!format.cgOperationHasImageFields(mode, operation)) return operation;
    const value = existing ? format.normalizeCgPromptFormat(existing.operation?.cgPromptFormat) : format.normalizeCgPromptFormat(selected);
    const { cgPromptFormat: ignored, cgPromptDialect: ignoredDialect, cgCastLooks: ignoredLooks, cgParticipantLooks: ignoredPeople, ...base } = operation;
    // Old journals keep their exact recipe; only new multiplayer tasks use IDs.
    const dialect = existing ? existing.operation?.cgPromptDialect : Array.isArray(participantLooks) ? 'r84168-actions' : 'r84166-actions';
    const looks = existing ? existing.operation?.cgCastLooks : String(castLooks || '').slice(0, 1600);
    const people = existing ? existing.operation?.cgParticipantLooks : participantLooks;
    return value ? { ...base, cgPromptFormat: value, ...(['r8413', 'r8420', 'r8483', 'r84166', 'r84168', 'r84166-actions', 'r84168-actions'].includes(dialect) ? { cgPromptDialect: dialect } : {}),
        ...(['r84166', 'r84166-actions'].includes(dialect) && typeof looks === 'string' && looks ? { cgCastLooks: looks } : {}),
        ...(['r84168', 'r84168-actions'].includes(dialect) && Array.isArray(people) ? { cgParticipantLooks: structuredClone(people) } : {}) } : base;
}

export function cgSegmentValidator(validator, options) {
    // The original domain validator still owns fields, evidence and per-item
    // acceptance. Dialect instructions are attached by cgPromptForSegment;
    // a model's different imagePrompt wording must not discard valid content.
    return validator;
}
