import { initRabbitMirrorUI, destroyRabbitMirrorUI } from './src/ui.js?rmv=1.4.30.12';
import { rabbitMirrorGenerateInterceptor, clearRabbitMirrorPrompt } from './src/injector.js?rmv=1.4.30.12';
import { clearLastCombo } from './src/storage.js?rmv=1.4.30.12';
import { initVisualScanner, destroyVisualScanner } from './src/visualScanner.js?rmv=1.4.30.12';
import { initOutputSanitizer, destroyOutputSanitizer } from './src/outputSanitizer.js?rmv=1.4.30.12';
import { clearAllFeedbackCatState, destroyFeedbackCatPromptSync, initFeedbackCatPromptSync } from './src/feedbackCat.js?rmv=1.4.30.12';
import { getSettings } from './src/settings.js?rmv=1.4.30.12';
import { clearRabbitMirrorGenerationSnapshots } from './src/generationGuard.js?rmv=1.4.30.12';
import { initIndependentRabbitMirror, destroyIndependentRabbitMirror } from './src/independentApi.js?rmv=1.4.30.12';
import { initTouchTheaterBridge, destroyTouchTheaterBridge } from './src/touchTheater.js?rmv=1.4.30.12';

const RABBIT_MIRROR_RUNTIME_VERSION = '1.4.30.12';

// Claim the active runtime before UI/DOM initialization. Versioned module URLs ensure this file and its internal graph cannot be satisfied by a stale hot-reload cache.
try { globalThis.__rabbitMirrorFeedbackCatSyncCleanup?.(); } catch {}
globalThis.__rabbitMirrorRuntimeVersion = RABBIT_MIRROR_RUNTIME_VERSION;

// SillyTavern reads this global function name from manifest.json -> generate_interceptor.
globalThis.rabbitMirrorGenerateInterceptor = rabbitMirrorGenerateInterceptor;

jQuery(async () => {
    initFeedbackCatPromptSync(() => getSettings().feedbackCatEnabled !== false);
    globalThis.__rabbitMirrorFeedbackCatSyncCleanup = destroyFeedbackCatPromptSync;
    initRabbitMirrorUI();
    initOutputSanitizer();
    initVisualScanner();
    initIndependentRabbitMirror();
    initTouchTheaterBridge();
    console.log(`[RabbitMirror] runtime ${RABBIT_MIRROR_RUNTIME_VERSION} loaded`);
});

export function onDisable() {
    destroyFeedbackCatPromptSync();
    clearRabbitMirrorPrompt();
    destroyRabbitMirrorUI();
    destroyOutputSanitizer();
    destroyVisualScanner();
    destroyIndependentRabbitMirror();
    destroyTouchTheaterBridge();
    clearRabbitMirrorGenerationSnapshots();
}

export function onClean() {
    destroyFeedbackCatPromptSync();
    destroyRabbitMirrorUI();
    destroyOutputSanitizer();
    destroyVisualScanner();
    destroyIndependentRabbitMirror();
    destroyTouchTheaterBridge();
    clearRabbitMirrorPrompt();
    clearLastCombo();
    clearAllFeedbackCatState();
    clearRabbitMirrorGenerationSnapshots();
}
