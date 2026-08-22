# 心跳回忆 0.8.4 — Security Diff Review

Scope: 0.8.3 → 0.8.4 only.

## Result

No new Critical / High / Medium vulnerability was identified in the reviewed diff. The new network surface is limited to current-chat external-memory synchronization during an explicit manual archive create/update operation.

## Reviewed change surface

- Added current-chat external memory bridge.
- Added SillyTavern `1_memory` summary ingestion for the active chat.
- Added EverMind current-session ingestion using the active chat metadata `st_evermind.group_id` only.
- Added external-memory record / anchor provenance checks.
- Added per-provider record and character budgets.
- Added archive-room opt-out UI.
- Added proprietary test license and related documentation.

## Security properties verified

1. **Current chat only**: EverMind requests are built only from `chatMetadata.st_evermind.group_id`. The code has no `char_group_id` read path.
2. **Cross-chat late response rejection**: after provider fetch and after model extraction, the active `chatId` is checked against the task snapshot. Chat changes also abort the task controller.
3. **No automatic provider polling**: external memory is collected only from `importCurrentChatMemory()`, i.e. explicit manual archive create/update. Base bundle / ADV / room life generation do not call external providers.
4. **Credential containment**: an EverMind key, if that third-party extension already stores one in its own settings, is read transiently to construct a single Authorization header. It is not copied into Heartbeat settings, archive metadata, prompts, DOM, logs, or error text.
5. **Provider URL not model-controlled**: the `/proxy` destination comes only from the already-configured EverMind provider URL, not from model output, archive text, world info, or chat content. Only `http:` / `https:` schemes are accepted.
6. **Untrusted provider data remains data**: provider responses are normalized and then passed to the model inside an explicitly untrusted JSON block. Generic ST macros remain neutralized by the existing safe role-macro expansion path.
7. **Evidence validation**: an external candidate must reference an allowed provider record ID and supply a `sourceExternalAnchor` that occurs verbatim in the cited provider record. A guessed ID/anchor pair that is not supported by the record is rejected.
8. **Budgets**: external memory is capped at 64 normalized records / ~30,000 characters before model extraction, and the existing final 96,000-character / ~32,000-token prompt budget still applies.
9. **Archive provenance**: provider names/counts and an external-memory fingerprint may be persisted, but raw provider records and provider credentials are not persisted in Heartbeat metadata.
10. **Manual-update semantics preserved**: external memory changes do not mutate Heartbeat archives automatically. They only affect a new archive revision after the user explicitly updates the current chat archive.

## Targeted runtime regression

A Node VM mock test verified:

- current SillyTavern Memory summary detection;
- EverMind current-chat provider detection;
- EverMind request includes current `group_id` and never `char_group_id`;
- provider result flattening;
- valid external anchor acceptance;
- hallucinated external anchor rejection;
- response rejection after changing from chat A to chat B.

`node --check` passes for `index.js` and `src/heartbeatMemories.js`.

## Remaining test-stage checks

- Verify the real EverMind deployment used by testers returns the same list response shape for `GET /api/v0/memories?user_id=...&group_id=...&limit=...`.
- Verify SillyTavern CORS proxy is enabled when EverMind is used.
- Verify very large current-chat memory databases are truncated predictably by the 64-record / 30k-character bridge budget.
- Verify a current-chat memory provider failure degrades to chat-text-only archive import without blocking the archive.

## Licensing note

The repository now carries `Tokimemo Proprietary Test License v1.0`. This is not an open-source license. A public GitHub repository still makes source code visible/downloadable under GitHub platform behavior; use a private repository during closed testing if source visibility itself is not acceptable.
