import * as core_context from '../core/context.js';
import * as core_constants from '../core/constants.js';
import * as archive_repository from '../archive/repository.js';

// SillyTavern emits CHAT_RENAMED after reloading the renamed chat. A generic
// CHAT_CHANGED event cannot distinguish a rename from a copied/branched chat.
export async function handleArchiveChatRename(event) {
    if (!event || typeof event !== 'object' || event.groupId) return null;
    let context;
    try { context = core_context.currentCharacterGuard(); } catch { return null; }
    const oldId = core_context.comparableChatId(event.oldFileName);
    const newId = core_context.comparableChatId(event.newFileName);
    const currentId = core_context.comparableChatId(core_context.getChatId(context));
    const avatar = core_context.currentCharacterAvatar(context);
    const raw = context.chatMetadata?.[core_constants.MEMORY_KEY];
    if (!oldId || !newId || oldId === newId || currentId !== newId
        || !avatar || avatar !== String(event.avatarId || '').trim()
        || core_context.comparableChatId(raw?.chatId) !== oldId) return null;
    // The migration transaction rechecks the complete live identity and source
    // after every asynchronous storage boundary. This wrapper never edits data.
    return await archive_repository.claimMismatchedArchive(context);
}
