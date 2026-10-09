// Read-only compatibility with 智绘姬's character-config schema. Do not expand
// $macros$ through the provider: an absent/ambiguous preset must use our fallback
// before the one image request is sent, not trigger a second generation.
const INVALID = Symbol('unsupported-preset-data');

function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function field(value, key) {
    if (!object(value) && !Array.isArray(value)) return INVALID;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !descriptor ? undefined : Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : INVALID;
}

function normalizedName(value) {
    return typeof value === 'string' ? value.normalize('NFKC').toLowerCase()
        .replace(/-/g, ' ').replace(/[‘’`´]/g, "'").replace(/\s+/g, ' ').trim() : '';
}

function selectedKeys(settings, idField, presetsField) {
    const id = field(settings, idField);
    if (id === undefined || id === '') return [];
    if (typeof id !== 'string') return null;
    const presets = field(settings, presetsField);
    if (presets === undefined) return [];
    if (!object(presets)) return null;
    const selected = field(presets, id);
    if (selected === undefined) return [];
    if (!object(selected)) return null;
    const entries = field(selected, 'characters');
    if (entries === undefined) return [];
    if (!Array.isArray(entries)) return null;
    const keys = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = field(entries, String(i));
        const key = typeof entry === 'string' ? entry : object(entry) ? field(entry, 'characterPresetName') : INVALID;
        if (typeof key !== 'string') return null;
        if (key) keys.push(key);
    }
    return keys;
}

export function literalPresetAppearanceText(value) {
    if (value === undefined) return '';
    // Unknown or unresolved dynamic values cannot safely replace known local
    // appearance. Repeated braces are also valid NAI emphasis, so only actual
    // template expressions are rejected, not {{blonde hair}} or {{{blue eyes}}}.
    if (typeof value !== 'string' || /\$/u.test(value)) return null;
    const expressions = value.matchAll(/\{\{+\s*([^{}]*?)\s*\}\}+/gu);
    for (const [, expression] of expressions) {
        const macro = expression.trim();
        if (/^(?:char|user|persona|description|personality|scenario|mesexamples|charprompt|charinstruction|charjailbreak|charversion|charcreator|charcreatornotes|original|input|lastmessage|lastusermessage|lastcharmessage|lastmessageid|firstincludedmessageid|lastswipeid|currentswipeid|time|date|weekday|isotime|isodate|datetime|idle_duration|timestamp|newline|trim|noop|outlet|anchorbefore|anchorafter|systemprompt|jailbreak|banned|pick|random|roll|getvar|getglobalvar|setvar|setglobalvar|addvar|addglobalvar|incvar|incglobalvar|decvar|decglobalvar|if|else|endif|while|each|return|eval)(?:\s*::|\s*$)/iu.test(macro)
            || macro.startsWith('//') || macro.includes('::') && !/^[-+]?(?:\d+(?:\.\d+)?|\.\d+)::[\s\S]*::$/u.test(macro)) return null;
    }
    return value.trim();
}

// Dropping one clause from a weighted group must not leave an opening/closing
// brace in the provider prompt. Retain matched pairs exactly; only orphaned
// delimiters (and a detached SD closing weight) lose their syntax.
export function balancedPresetAppearance(value) {
    const opening = new Map([['}', '{'], [']', '['], [')', '(']]);
    const stack = [], remove = new Set();
    for (let index = 0; index < value.length; index++) {
        const char = value[index];
        if ('{[('.includes(char)) stack.push({ char, index });
        else if (opening.has(char)) {
            if (stack.at(-1)?.char === opening.get(char)) stack.pop();
            else {
                remove.add(index);
                if (char === ')') {
                    const weight = value.slice(0, index).match(/:\s*[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s*$/u);
                    if (weight) for (let offset = index - weight[0].length; offset < index; offset++) remove.add(offset);
                }
            }
        }
    }
    for (const token of stack) remove.add(token.index);
    return value.split('').filter((_, index) => !remove.has(index)).join('');
}

export function visiblePresetAppearance(value, visible) {
    if (visible !== 'hands' && visible !== 'back') return value;
    return balancedPresetAppearance(value.split(/[,，;；\n。]+/u).map(part => part.trim()).filter(part => {
        if (!part) return false;
        if (visible === 'back') return !/\b(?:eyes?|irises|pupils?|face|facial|cheeks?|cheekbones?|jaw|chin|brows?|eyebrows?|eyelashes?|lips?|mouth|nose|front(?:al)?(?:[- ]view)?|portrait)\b|眼|瞳|脸|臉|面容|面颊|面頰|颧|顴|下巴|下颌|下頜|眉|睫|嘴|唇|鼻|正面/iu.test(part);
        return /\b(?:skin|hands?|fingers?|wrists?)\b|肤|手|指|腕/iu.test(part)
            && !/\b(?:hair|eyes?|irises|pupils?|face|facial|cheeks?|cheekbones?|jaw|chin|brows?|eyebrows?|eyelashes?|lips?|mouth|nose|head|portrait|body|torso|chest|legs?|feet|foot)\b|头|頭|发|髮|眼|瞳|脸|臉|面容|面颊|面頰|颧|顴|下巴|下颌|下頜|眉|睫|嘴|唇|鼻|身体|身體|全身|半身|胸|腿|脚|腳/iu.test(part);
    }).join(', '));
}

function presetNegative(preset) {
    // This optional field cannot invalidate a usable positive appearance. It
    // contains exclusions, so positive visibility filters must not reinterpret it.
    try { return literalPresetAppearanceText(field(preset, 'negative')) || ''; }
    catch { return ''; }
}

export function chatu8PresetAppearance(context, name, options = {}) {
    try {
        const requested = normalizedName(name);
        const requestedVisible = field(options, 'visible');
        const visible = requestedVisible === undefined ? 'full' : requestedVisible;
        if (!requested || /\$|\{\{/u.test(requested) || !['full', 'face', 'hands', 'back'].includes(visible)) return null;
        const extensionSettings = field(context, 'extensionSettings');
        const settings = field(extensionSettings, 'st-chatu8');
        if (!object(settings)) return null;
        const presets = field(settings, 'characterPresets');
        if (!object(presets)) return null;
        const enabled = selectedKeys(settings, 'characterEnablePresetId', 'characterEnablePresets');
        const common = selectedKeys(settings, 'characterCommonPresetId', 'characterCommonPresets');
        if (!enabled || !common) return null;
        const keys = [...new Set([...enabled, ...common, ...Object.keys(presets)])];
        const matches = [];
        for (const key of keys) {
            const preset = field(presets, key);
            if (preset === undefined) continue;
            if (!object(preset)) return null;
            const cn = field(preset, 'nameCN'), en = field(preset, 'nameEN');
            if ((cn !== undefined && typeof cn !== 'string') || (en !== undefined && typeof en !== 'string')) return null;
            const names = [key, ...(cn || '').split('|'), ...(en || '').split('|')];
            if (names.some(alias => normalizedName(alias) === requested)) matches.push({ key, preset });
        }
        // A selected list can belong to a previous card. It is not evidence that
        // one same-name character is the current person. Never pick first/best.
        if (matches.length !== 1) return null;
        const { key, preset } = matches[0];
        const traits = literalPresetAppearanceText(field(preset, 'characterTraits'));
        const facial = visible === 'hands' ? '' : literalPresetAppearanceText(field(preset, visible === 'back' ? 'facialFeaturesBack' : 'facialFeatures'));
        if (traits === null || facial === null) return null;
        const tag = visiblePresetAppearance([traits, facial].filter(Boolean).join(', '), visible);
        if (!tag) return null;
        const negative = presetNegative(preset);
        return { tag, source: 'chatu8', presetKey: key, ...(negative ? { negative } : {}) };
    } catch {
        // Unsupported proxies/host versions are an unavailable preset, never a
        // reason to block generation or call another provider automatically.
        return null;
    }
}
