# Codex Security Remediation Review — 心跳回忆 0.8.1

## Scope

Targeted remediation review of the 0.8.0 independent audit findings against `src/heartbeatMemories.js`, plus syntax/static checks and a local mock SillyTavern regression harness. This file replaces the obsolete 0.8.0 review that incorrectly stated there were no high/medium/low findings.

## Remediated blockers

- **H-1**: added `isPlaceholderText`; non-empty `temporaryObjects` no longer throws. Filtering now occurs before the final 3-item cap.
- **H-2**: failed automatic room-life generation records `lifePlanAttempt`, persists a same-day local fallback (`generatedAt: 0`), and blocks further automatic retries for that date. Manual refresh may retry.
- **H-3**: sessions and cache now carry `chatId`; `saveSession` refuses stale-chat writes; `loadSession` validates chatId + archiveRevision; mode and ADV generation re-check target chat/archive after await; room life uses the same boundary.
- **M-1**: removed generic `substituteParams(prompt)` from generated prompts. Only `{{char}}` and `{{user}}` are locally expanded; remaining `{{...}}` tokens are neutralized with full-width braces before sending.

## Additional hardening

- **M-2**: source-memory claims now require both a valid `sourceMemoryIds` set and a `sourceMemoryAnchor` that matches an anchor/title of the referenced memory (or appears as that exact evidence term in generated content). A guessed valid ID alone is rejected.
- **M-3**: generation memory payloads are bounded to a timeline-spanning sample of at most 48 memories with tighter per-field caps. Character/world-info envelope caps were reduced. Final input is rejected before API dispatch above 96,000 characters or approximately 32,000 tokens when a tokenizer is available. Archive chunk generation reuses one envelope instead of rebuilding it per chunk.
- **M-4 / L-6**: chat changes and extension destruction abort the active request. Archive writes verify the original chat ID before persistence; stale archive work is discarded with an explicit warning.

## Local regression harness

The local mock harness verifies:

1. non-empty room temporary objects normalize without ReferenceError and placeholders are removed;
2. `{{lastMessage}}` / `{{input}}` remain neutralized while `{{char}}` / `{{user}}` expand locally;
3. a guessed existing memory ID without semantic evidence is rejected, while a correct archive anchor passes;
4. an A-chat session cannot be saved into B metadata after a chat switch;
5. a failed daily-life request makes one provider call, persists same-day fallback + failure state, and a second automatic ensure call does not call the provider again.

Both JavaScript entry files pass Node syntax checks.

## Remaining runtime validation

The one-click “import current SillyTavern connection” path still relies on official Connection Manager slash-command getter behavior when no Connection Manager profile is already selected. The 0.8.0 independent audit classified this as a **potential runtime compatibility risk (M-6), not a verified vulnerability**. Before public release, verify on a real SillyTavern 1.18.x+ instance that reading `api / preset / api-url / model / proxy / prompt-post-processing / instruct / secret-id` with an empty value does not mutate the user's current connection and that the generated profile contains the expected fields. If this runtime check fails, disable snapshot creation and require selecting an existing Connection Manager Profile rather than exposing secret values.

Other non-blocking items from the independent audit (metadata growth, weak-model hard-count UX, dynamic mobile viewport, ESC/backdrop close, chat rename/archive ownership) remain product-quality follow-ups rather than release-blocking security findings.

## Conclusion

The independently reproduced 0.8.0 release blockers H-1/H-2/H-3 and M-1 are remediated in 0.8.1, with M-2/M-3/M-4 additionally hardened. No API secret-value read path was added. Candidate status still depends on the real SillyTavern runtime checks listed above, especially the one-click Connection Manager snapshot behavior.
