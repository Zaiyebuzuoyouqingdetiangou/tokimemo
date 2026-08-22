import { setExtensionPrompt, extension_prompt_types, extension_prompt_roles } from '../../../../../script.js';
import { MODULE_NAME, getSettings } from './settings.js?rmv=1.4.30.12';
import { buildRabbitMirrorPromptDetails } from './promptBuilder.js?rmv=1.4.30.12';
import {
    buildFeedbackCatFinalCheck,
    buildFeedbackCatPrompt,
    clearFeedbackCatExtensionPrompt,
    getActiveFeedbackForCurrentChat,
    markFeedbackCatInjected,
} from './feedbackCat.js?rmv=1.4.30.12';
import { recordRabbitMirrorInjection, recordRabbitMirrorNoInjection } from './tokenMeter.js?rmv=1.4.30.12';
import { attachRabbitMirrorGenerationSelection, beginRabbitMirrorGenerationAttempt } from './generationGuard.js?rmv=1.4.30.12';

const INJECT_KEY = `${MODULE_NAME}:auto_injection`;

let generationInvocationSequence = 0;

function createGenerationScopeKey(type) {
    generationInvocationSequence += 1;
    const generationType = String(type || 'normal').replace(/[^a-z0-9_-]+/gi, '-');
    return `${generationType}:${Date.now().toString(36)}:${generationInvocationSequence.toString(36)}`;
}

export function clearRabbitMirrorPrompt(reason = 'cleared', generationType = '') {
    clearFeedbackCatExtensionPrompt();
    try {
        setExtensionPrompt(INJECT_KEY, '', extension_prompt_types.IN_CHAT, 0, false, extension_prompt_roles.SYSTEM);
        recordRabbitMirrorNoInjection(reason, generationType);
    } catch (error) {
        console.warn('[RabbitMirror] Failed to clear extension prompt:', error);
    }
}

export async function rabbitMirrorGenerateInterceptor(_chat, _contextSize, _abort, type) {
    const settings = getSettings();

    if (settings.generationSource === 'independent') {
        clearRabbitMirrorPrompt('independent-api', type);
        return;
    }

    const skipQuiet = settings.skipQuiet && type === 'quiet';
    const skipImpersonate = settings.skipImpersonate && type === 'impersonate';

    if (!settings.enabled || !settings.autoRabbitMirrorInjection || settings.mode === 'off' || skipQuiet || skipImpersonate) {
        const reason = skipQuiet
            ? 'quiet-skipped'
            : skipImpersonate
                ? 'impersonate-skipped'
                : 'disabled';
        clearRabbitMirrorPrompt(reason, type);
        return;
    }

    const activeFeedback = settings.feedbackCatEnabled !== false ? getActiveFeedbackForCurrentChat(_chat) : null;
    const feedbackPrompt = activeFeedback ? buildFeedbackCatPrompt(activeFeedback) : '';
    const feedbackFinalCheck = activeFeedback ? buildFeedbackCatFinalCheck(activeFeedback) : '';
    // 冻结 0.33.77 的基础生成 Prompt 与拼接位置：基础 Prompt 逐字保持，反馈仅在其后追加。
    // 未选择反馈时不追加任何字符，基础 Prompt 保持逐字不变。
    clearFeedbackCatExtensionPrompt();
    const generationScopeKey = createGenerationScopeKey(type);
    beginRabbitMirrorGenerationAttempt(_chat, generationScopeKey);
    const promptDetails = buildRabbitMirrorPromptDetails(settings, type, null, generationScopeKey, { chat: _chat });
    attachRabbitMirrorGenerationSelection(promptDetails.metadata);
    const basePrompt = promptDetails.prompt;
    if (!basePrompt) {
        clearRabbitMirrorPrompt(promptDetails.metadata?.disabled ? 'directive-skipped' : 'empty', type);
        return;
    }
    const prompt = feedbackPrompt
        ? `${basePrompt}\n\n${feedbackPrompt}${feedbackFinalCheck ? `\n\n${feedbackFinalCheck}` : ''}`
        : basePrompt;
    const role = settings.role === 'user' ? extension_prompt_roles.USER : settings.role === 'assistant' ? extension_prompt_roles.ASSISTANT : extension_prompt_roles.SYSTEM;

    setExtensionPrompt(
        INJECT_KEY,
        prompt,
        extension_prompt_types.IN_CHAT,
        Number(settings.depth) || 0,
        false,
        role,
    );
    recordRabbitMirrorInjection({
        prompt,
        basePrompt,
        generationType: type,
        metadata: promptDetails.metadata,
    });
    if (activeFeedback && feedbackPrompt) markFeedbackCatInjected(activeFeedback, type, feedbackPrompt);
}
