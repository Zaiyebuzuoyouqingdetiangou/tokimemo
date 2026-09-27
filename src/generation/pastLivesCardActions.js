import * as text from '../core/text.js';
import * as cards from '../core/lenticularCards.js';
import * as targets from '../core/cgTargets.js';
import * as cache from '../core/cache.js';
import * as contextApi from '../core/context.js';
import * as cg from './cgImageCore.js';
import { state as runtimeState } from '../core/state.js';

// The existing CG capture binds the operation to chat, character, archive,
// partial-result owner and mode write fence. This path never generates anything.
export function capturePastLivesCard(session, descriptor) {
    const resolved = targets.expandedCgItem(session, descriptor);
    if (resolved?.mode !== 'pastLives') return null;
    const target = cg.captureCgImageTarget({ mode: 'pastLives', session, item: resolved.item });
    return target ? Object.freeze({ target, sourceHash: resolved.item.sourceHash, pair: cards.cardPairSignature(session, resolved.item.id) }) : null;
}

export async function savePastLivesCard(captured, reference) {
    cg.assertCgImageTargetCurrent(captured?.target);
    const target = captured.target, context = contextApi.currentCharacterGuard();
    const mutate = (latest, memory) => {
        if (!cg.isCgImageTargetCurrent(target) || memory.archiveRevision !== latest.archiveRevision) return null;
        if (reference !== null && !cards.resolveCardReference(cache.getCache(context), latest, reference)) return null;
        return cards.applyPastLivesCardPair(latest, target.itemId, captured.sourceHash, captured.pair, reference,
            cards.nextCardEditRevision(cache.getCache(context), latest, target.itemId));
    };
    let committed = null;
    if (target.draftId && cg.cgDraftRecord(context, target.draftId)?.status === 'open') {
        committed = await cache.commitGenerationTaskResultMutation(context, target.draftId, mutate, {
            expectedTaskOrigin: target.origin, stillCurrent: () => cg.isCgImageTargetCurrent(target),
        });
    }
    if (!committed && (!target.draftId || cg.cgDraftRecord(context, target.draftId)?.status === 'complete')) {
        committed = await cache.commitSessionMutation('pastLives', contextApi.getChatId(context), target.origin, mutate,
            target.draftId ? null : target.session, { keepCommittedOnMirrorFailure: true });
    }
    if (!committed) throw text.safeUserError('画面或档案已变化，请重新打开选图。原配对没有改变。', 'RMT_CARD_CHANGED');
    if (contextApi.isCurrentTaskOrigin(target.origin) && runtimeState.activeSession === target.session) {
        target.session[cards.LENTICULAR_KEY] = structuredClone(committed[cards.LENTICULAR_KEY]);
    }
    return committed;
}
