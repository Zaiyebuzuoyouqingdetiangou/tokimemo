## 0.8.45 / r49.0 deep-review changed-surface security review

Scope: r48.0 -> r49.0 persistence lifecycle, API/profile isolation, ArchiveTarget, world-presentation authority, room/travel/phone/calendar normalizers, local SVG/DOM rendering, theme/tag UI and release identity.

- ArchiveTarget is explicit, origin-bound and compare-and-swap protected. Frozen A context excludes live B; completion cannot change target based on current UI state. Its initiating lifecycle is carried through hydration, revalidation, claim, provider admission and durable write, so destroy/restart cannot be adopted as a fresh epoch. Revision/rebuild/delete/mode fences invalidate stale work, while different modes may coexist.
- Cache metadata, independent backup and deferred recovery preserve copy-on-write and fail closed after lifecycle changes. Ordinary bootstrap and message events do not gain IndexedDB/decompression/provider work.
- Manual and named Profile routes use distinct settings and model fallbacks. Heartbeat-owned error paths return only bounded categories/status/origin and redact HTML bodies, prompt/history/world/archive content and credential-shaped text.
- The former EverMind adapter read another extension's private settings, chat metadata and API key, while compatibility paths guessed unknown plugins from global method names or ambient prompt/metadata labels. r49 removes all of those paths from registration, UI, discovery and fetch; existing Heartbeat ledger data remains readable and inert file import remains available.
- Coverage claims fail closed: missing floors or returned/total mismatches force partial status at both provider and ledger normalization, preserving any prior complete baseline. Provider traversal and fallback are bounded by the source-ledger character budget, and accessor-backed array elements are rejected without invoking their getters.
- Presentation authority is centralized and provenance-scoped. Character Profile excerpts must be uniquely present in the current bound source; archive fallback requires two non-overlapping real-chat clusters. Media/fiction frames and negated assertions cannot become world/map evidence through punctuation, Profile or archive consensus.
- Model-provided visual and textual records are rebuilt from allowlists. No reviewed sink grants model HTML/CSS/JS/SVG/path/URL/class/event/storage/target authority; local SVG complexity is bounded and deterministic.
- A UI reviewer proposed that an escaped Travel tone could terminate the class attribute. A real Edge/Chromium tokenizer probe produced one section and zero injected images, so the claimed attribute-boundary XSS was falsified. The underlying lower-severity class-authority gap was still real: Travel tone/mapTheme and Calendar status dots now revalidate through local allowlists at their final HTML sinks, including current-version cached data.
- Room no longer grants a whole prose block authority merely because one clause says “today” or “now”. After the user is mentioned, every clause must independently match a bounded present-only form; unknown, adjacent and nested episode paraphrases fail closed. Daily-life history requires an exact real Mxxx anchor that also occurs in the visible narrative, and the same gate rejects unsafe cached daily beats at presentation time. The bounded present grammar still accepts immediate greetings, explicit current-progress, future intent, direct feelings/questions and current environment state.
- Positive controlled pet ownership is now an output invariant. If the character card/world setting proves that the current character owns a species, an empty or mismatched `pets` result fails normalization and enters the existing repair path; local code never invents a name or story to make the candidate pass.
- Theme alpha is now consumed only by card-background tokens; the reading surface and text remain opaque, and readable colours are checked against both the solid and alpha-composited card surface. ID-scoped final rules protect the overlay, top bar, body, cards, buttons, form controls and horizontal layout from ordinary host/theme CSS. No theme plugin private state, model CSS or parent opacity gains authority.
- Reverse user-terminal generation remains blocked because allowed user assertions cannot yet be distinguished from inferred private facts with sufficient reliability.

Final severity and verification evidence are recorded in `RELEASE_VALIDATION-r49.md` after the immutable-diff review and final-package retest. No Critical / High / Medium finding may remain before candidate packaging.

Pre-release independent review exposed eight material candidate families before packaging: the runtime bundle had not yet incorporated the lifecycle fix; ambient prompt/metadata heuristics could ingest an unregistered source; contradictory BaiBai coverage could replace a complete baseline; accessor-backed public-DTO array entries could execute getters during traversal; cached presentation enums could append arbitrary class tokens; Room's old phrase/current-time logic missed ordinary, nested and cross-clause rewrites of ungrounded shared history (then briefly overblocked clear present speech); explicit pet evidence could still normalize to an empty `pets` list; and the theme alpha slider stored a value without changing presentation while ordinary host CSS could fade or rotate critical ancestor surfaces. All eight were treated as blockers, repaired at their common authority boundaries and covered by final regressions; none is silently omitted from the release record.

Final local verification on 2026-09-06: 310/310 Node regressions pass and 84/84 JS/MJS files pass syntax checks. The 54-module runtime rebuilt byte-identically twice from source SHA-256 `b444c86b00bc3e5d45c98b7aa6bea51e8f06a7276bdeb6ce91eaae954af7b5e3`, producing bundle SHA-256 `da4821f43997fd1756a39f5a8a0a02dd600b6966f3d4c99eb020c7bb131a809a`. Edge/Chromium passed the 320/375/390/430/768 px bootstrap geometry contract, startup/diagnostic runtime-request checks, real IndexedDB first write/read, fresh-page cold read, durable deletion-fence read and source-ledger cold deletion. A separate computed-style matrix passed Heartbeat default/custom, host light/dark, card alpha, contrast, ordinary hostile CSS and 320/375/390/430 px close/overflow checks. The final immutable r48-to-r49 scan contract and fresh-extract ZIP retest are recorded beside the release artifact.

Post-fix local conclusion: no open Critical, High, Medium or Low finding in the reviewed r48-to-r49 changed surface. Independent connection, archive, room-language, product/test and final security reviewers closed their assigned candidates. The first UI security reviewer's final follow-up could not be obtained after its tool rejected the request; every concrete counterexample it had already supplied was nevertheless retained as a permanent test and independently rechecked. This does not substitute for a live SillyTavern/TT/iPhone acceptance run.

## 0.8.44 / r48.0 local changed-surface security review

Scope: r47.0 -> r48.0 Calendar v6 holiday-card schema, prompt, migration, local procedural renderer, CSS and release identity.

- Holiday cards are accepted only for an unambiguous normalized `future` entry with `occasionType=holiday`; a birthday, anniversary, generic setting date or ambiguous duplicate source id cannot gain a card.
- Persisted card objects are rebuilt from allowlisted fields. Arbitrary HTML/CSS/JS/SVG/path/URL fields are dropped; all numeric art parameters are bounded and all visible strings are normalized.
- The SVG renderer constructs only code-owned primitives with code-owned attributes and local deterministic positions. It does not concatenate model-provided markup, paths, URLs, classes, selectors or event handlers. Visible card text is escaped before `innerHTML`.
- Calendar v5 `dayPages` migrate to v6 without falling back to the legacy root-note rebuild path, preserving per-date user compatibility data. Refresh retains an older card only while its referenced holiday entry still exists; a fresh card for the same holiday replaces it.
- No new request, credential, external-reader, IndexedDB-at-bootstrap, archive-write, CAS, delete-fence or cross-chat authority was introduced.

Local conclusion: no Critical / High / Medium issue identified in the r48 changed surface. Independent Codex Security reviewer receipt was not obtained in this environment and must not be inferred from this local review.

## 0.8.43 / r47.0 local changed-surface security review

Scope: r46.0 -> r47.0 TT-derived-cache durability, same-revision backup reconciliation, provider error sanitization, theme settings, archive-title constraints, room headwear evidence, world-aware travel keepsakes and private-terminal presentation.

- Persistence keeps chat/character/origin/revision/delete fences and only opens the independent backup from full-runtime paths. Deferred results remain queued when a durable write cannot be confirmed.
- Heartbeat error summaries do not include provider HTML/response bodies or credential-shaped Authorization/Bearer/API-key/token values.
- Theme colors are strict hex values plus bounded alpha; host-follow reads standard computed foreground/background only. No private theme-plugin settings or undocumented callable interface is used.
- New travel/phone/room presentation values are allowlisted before they reach class/data attributes; model-provided text is escaped and no arbitrary model HTML/CSS/JS/URL/coordinates are executed.
- No live-chat/CAS/archiveRevision/delete-fence protection is removed. Cross-chat ArchiveTarget and reverse-terminal privacy features are intentionally not implemented in this candidate.

Verification for this candidate: targeted regression 87/87 passed; full regression 266/266 passed; 76 JS/MJS files passed syntax checks; the 52-module runtime bundle rebuilt twice identically (source SHA-256 `cbe904a473537e530340733134f0005612aa768d10177a1ff3e431ffff2f999b`, bundle SHA-256 `b1725d4fdd2704324614fc368be09020f6ad03d3c75e7db75fd309300ea122d8`). Local changed-surface review found no new High/Medium issue. TT/iPhone/WebView persistence and visual behavior remain real-device verification items.

This section records the local changed-surface review. It is not an independent external reviewer attestation.

## 0.8.42 / r46.0 universal memory, durable-result and postcard targeted review

Scope: r45.0 -> r46.0 registered memory adapters, local file import, World Info history classification, browser-local source ledger, external-history archive input, navigation/generation durability, CG image references, archive close behavior, travel postcard scene selection/cropping, release identity and generated runtime bundle.

- The BaiBai Book adapter recognizes only `globalThis.STBaiBaiBook` with numeric public `apiVersion === 1`. It prefers the complete `getHistory()` DTO, treats injected-history fallback as partial, authenticates both history and snapshot against the captured current chat, and rejects a pair whose revisions remain inconsistent after one bounded reread. Snapshot state is not flattened into historical events.
- File import accepts only JSON/JSONL/TXT/MD/MARKDOWN within fixed byte/character/record limits. Parsing is inert; preview shows exact role/chat binding plus text samples with `textContent`, and unknown non-metadata JSON string leaves remain visible with their field path. Credential-shaped values and password/token/API/connection fields are excluded before preview/ledger/model use and force partial coverage. Commit requires an explicit assertion that the file is occurred history/summary rather than character setting, then rechecks the binding. The file-confirm action does not call registered or experimental third-party readers. World Info remains non-historical unless the user explicitly marks a book as history summary.
- The separate IndexedDB source ledger preserves provider/file text fragments, provider version, stable source ID, revision, hash and coverage for one role/chat scope. Provider, source and revision identities are derived from each complete untruncated value. Mutations are serialized, complete/partial revisions retain explicit baseline semantics, and multi-book writes are atomic. Legacy combined history-book rows migrate before tombstoning; per-book precise UID allowlists make explicit removal authoritative even while the replacement read is pending or fails. A reload or removed provider can still feed a bounded archive input from that prior confirmed ledger. Read/validation failures abort an upsert instead of becoming an empty ledger, and write/delete success waits for transaction completion. Storage limits fail without silently evicting old sources.
- Completed origin-bound work uses a localStorage recovery queue capped at 24 items, 3.5 MB and seven days. Credential-shaped and prototype-sensitive fields are removed during serialization and restore. Role identity is revalidated after backup/cache awaits and inside final archive/session writes. Character-slot hints isolate even fully cloned name/avatar/fingerprint cards in origins, cache scopes, indexes, groups and backups; display-identity migration remains exact-key and previous-revision gated. A backup completed just before a navigation race can be retried only when its deterministic full memory/cache payload is equivalent. ACK removes only the exact flushed queue object, so a newer same-millisecond result survives; transient backup/cache failures remain queued, and a failed newer persistence attempt keeps the last valid stored snapshot.
- Navigation blockers are restricted to tasks captured from the current chat, while full-page unload risk includes work from every chat and pending durable results. CG and daily-life completion preserve their original session/image reference when another chat is current. Archive close and host chat navigation fail open when native confirmation is unavailable so a WebView cannot trap the user; destructive data confirmations remain fail-closed.
- Far postcards accept only a code-owned scene-theme allowlist. Legacy locations infer a safe scene from bounded text, SVG geometry and colour remain code-owned, and the renderer uses a fixed 2:1 viewBox with non-cropping fit on desktop and mobile.

Local release verification on 2026-09-01: 259/259 Node regressions pass; 74/74 JS/MJS files pass syntax checks. The 51-module runtime bundle rebuilt byte-identically twice from source SHA-256 `96b229d669895517d7cf4c20abbce1de4eb4f56d4d2a0af70836c94af229a907`, producing bundle SHA-256 `3e5431c0de33e28bc326b851bcb5f6b7d46b9bc77a74af075c07394888115c7e`. The static bootstrap geometry contract passes at 320/375/390/430/768 px without horizontal overflow. ZIP CRC, relative-path/hash comparison and fresh-extract tests are performed by the packaging step.

Residual acceptance boundary: this environment has no live SillyTavern host, real BaiBai Book/EverMind provider, API credentials, Playwright Chromium or mobile browser. Provider E2E, IndexedDB/localStorage behavior in the target browser and final visual appearance therefore remain host checks; the local DTO, state, persistence-failure, layout-contract and generated-bundle tests do not substitute for those integrations.

## 0.8.41 / r45.0 independent API dual-configuration targeted review

Scope: r44.0 -> r45.0 independent-API settings, Connection Manager Profile capability gate, manual same-origin custom transport, model discovery/cache ordering, error handling, release identity and generated runtime bundle. The supplied Rabbit Mirror ZIP was treated only as user-owned behavioral reference; its UI and document instructions were not copied or executed.

- The two transports are mutually exclusive. Profile mode stores only a Profile ID/model override and validates Profile Secret forwarding plus request-level override capability before import, model discovery and generation. Manual mode stores the user's explicit Base URL/Key/model, but browser fetch targets remain fixed same-origin SillyTavern `/status` and `/generate`; no model or response text can select a network destination.
- Manual URLs reject credentials in the URL. A saved Key may use remote HTTPS or strict loopback HTTP only; the same rule runs at save, status rendering, model discovery and generation. Password fields never rehydrate the saved Key into DOM. Provider bodies and credential-like error codes are excluded from user-visible errors.
- Profile B model discovery submits Profile B's `secret_id` and explicitly clears custom header/body fields rather than borrowing main-chat Profile A headers. Manual headers exist only inside the one fixed same-origin request body.
- Model discovery and generation bind to lifecycle/configuration/request epochs and transport fingerprints. Out-of-order same-profile requests, in-flight Profile edits, configuration changes and runtime destruction cannot overwrite newer UI or cache state. Manual editing does not switch away from a working Profile until “保存并使用” validates successfully.
- HTTP 200 provider/Profile error envelopes remain failures. Only explicit rate-limit, timeout or server-failure evidence permits one bounded retry; opaque `API request failed` results do not repeat a potentially paid authentication/configuration failure.
- Responses are byte-bounded before JSON parsing, support common visible-content shapes and ignore reasoning/thought/analysis fields as final output. Profile requests use structured messages with preset/instruct injection disabled. The existing provider permit, absolute timeout, JSON validator and post-response archive-origin fence remain authoritative.

Independent review initially identified manual-draft loss, stale model-list UI/cache writes, false-success error envelopes, unsafe legacy-ready status, response-shape gaps and credential/error-classification issues. These were remediated and rechecked; no Critical / High / Medium issue remains in the r45 scope.

Release verification completed on 2026-08-30: 189/189 Node regressions pass; 67 JS/MJS files pass syntax checks; the 47-module bundle rebuilt byte-identically twice from source SHA-256 `e4250ec938cb92c699184d905a35d7dbeaa52071fe12b5b665540aa29f61533f`, producing bundle SHA-256 `c811f6f4bf27f6a3f4a20ddf431d099b4acda1b7c1318b8183524bba1b3cf3c3`. ZIP CRC, fresh-extract regression and artifact SHA-256 are performed by the packaging step.

Residual acceptance boundary: this environment had no live SillyTavern 1.18 host/provider credentials or real mobile browser, so actual one-click/manual provider calls and mobile visual rendering remain user-host E2E checks. Capability and transport failures are fail-closed before model-result commit.

## 0.8.39 / r43.0 persona surfaces, Calendar v5 and Butterfly-content targeted review

Scope: r42.7 -> r43.0 Calendar schema/migration/UI/content-management changes, Room persona visual profile and CSS figure, Phone device theme/navigation, Butterfly generation/normalization, release identity, documentation, regressions and rebuilt runtime bundle.

- Calendar v5 stores notebook material under allowlisted page keys. Per-date drafts, notes, mood snippets and manual To-Do rows no longer share a root board. Empty dates create local derived pages only. Existing archive-backed dates/promises keep their ID + anchor validation and Calendar remains unable to write `MEMORY_KEY`. Entry IDs and all page-local collection IDs are deterministically uniqued; duplicate source IDs remain resolvable only when evidence is unambiguous, archive-anchor dates outrank model dates, and normalization preserves the complete valid user page map instead of silently slicing after 480 pages.
- The v4 compatibility path has no fanout: an old root note moves to one page only when its linked Calendar entry, validated Mxxx evidence or setting-owned explicit date resolves that page. Ambiguous items are preserved once in `legacy:unassigned`; they are neither guessed into a date nor cloned to every day. Equal text on different date pages is preserved, while refresh merges page-owned user content by the exact page key without dropping same-ID/different-content rows.
- Room persona cues reduce to code-owned visual enums for scene, palette, material, density and the CSS figure's hair/garment/silhouette/accessory. Explicit setting fields are separated from inferred fields; missing fields and bounded face proportions are deterministically identity-bound, so a copied legal model template cannot make every character identical. The room does not embed archive/Profile avatars. Character card, Persona, World Info and model output cannot supply executable HTML/CSS, arbitrary class names, URLs, image sources or coordinates.
- Phone keeps its existing evidence, incremental, draft-resume and archive-revision boundaries while adding a code-owned `home -> app -> detail` view hierarchy. Device kind, theme, wallpaper treatment, icon style and App plan are normalized/allowlisted presentation data; navigation cannot become an object path, cache key, network destination, real message/contact action or third-party media load.
- Butterfly retains the existing divergence-tree UI, colors, one-second SIGNAL transition and Ω presentation. The changed trust surface is bounded generated text: the normalizer requires at least eight materially distinct ordinary simulations, substantial first-person monologues, present-world responses, Chinese SYSTEM NOTE text and a complete Ω; banned ex/third-party romance/family content fails locally before derived-cache commit. Initial, incremental and single-node regeneration all reuse the strict normalizers, with immutable node identity and world specification preserved locally.
- These changes do not add a canonical archive writer, direct provider endpoint, credential reader, external image URL, device API, dynamic-code primitive or permission to treat simulated/model-derived content as historical evidence. Existing escaping, task-origin, chatId/archiveRevision and read-only snapshot boundaries remain authoritative.

Release verification completed on 2026-08-27: 141/141 Node regressions pass; 57/57 JS/MJS files (including the generated bundle) pass syntax checks; the 44-module bundle rebuilt byte-identically twice from source SHA-256 `203b8b5f71cc56c83d59ffa4392f77f527b3eb36fecae6a3debd96b1363ec87e`, producing bundle SHA-256 `6279083bfc8271438fe96c99a5a4aa7b767ba58e79ae99a1e10078205d2774e9`. The Butterfly view remains byte-identical to r42.7 (`4c72cd7a2f28d5c34f2b6e4dab3010d7539e2bb677720ce339762c5647a8e98a`), and its dedicated CSS rules are unchanged. Static 320/375/390/430/768 px layout geometry passes without horizontal overflow. ZIP CRC and fresh-extract reruns are performed by the packaging step; the artifact SHA-256 is reported beside the deliverable because embedding it would change the artifact.

Final targeted conclusion: no new Critical / High / Medium security issue remains in the r42.7 -> r43.0 change set. Real iPhone/SillyTavern rendering and live provider-output E2E were not executable in this environment because the Playwright Chromium binary and a live host/provider were unavailable; this is a residual product-verification gap, not a bypass of the local validation evidence above.

## r42.1 GS4-style Firefly Habitat targeted review

- Scope: firefly prompt/schema/normalization, single-item regeneration, legacy-upgrade path, Heart UI labels/rendering, release metadata and rebuilt runtime bundle. This is a changed-behavior review, not a repeat full-repository scan.
- Semantics corrected to the original GS4 topic model: pink=恋爱, blue=恋爱的烦恼, yellow=朋友, white=お楽しみ/character-specific topic; `desire` remains an explicit Heartbeat-only extension and is not represented as an original GS4 color.
- New firefly output is bounded structured `script[]`, not arbitrary HTML or free-form DOM. Speaker values are allowlisted to `char/user/user_thought`; user lines are non-canonical neutral reactions only, and `user_thought` is limited to one final node. All rendered text continues through escaping / existing text rendering.
- Legacy `line/thoughts` entries remain readable and are treated as upgrade candidates. Upgrade preserves id, color, source Mxxx list, generation batch and timestamp; it changes only derived presentation fields and does not mutate `MEMORY_KEY` or advance incremental coverage.
- Yellow/white topic prompts require known setting/evidence for named third parties or concrete biographical facts, reducing accidental fabricated social history. No model-controlled URL, CSS, coordinates, fetch target, command, `eval`, `new Function`, MutationObserver or requestAnimationFrame path was added.

Targeted conclusion: no new Critical / High / Medium security finding identified in r42.0 → r42.1 firefly changes.

## r41.5 Performance hardening targeted review

Scope: r41.4 -> r41.5 performance-only changes.

- Tombstone filtering now builds one operation-local Set index and reuses it across archive rows. The index contains only normalized Heartbeat group/source identity keys; it does not widen deletion authority or touch SillyTavern chat files.
- Ordinary message-event UI refresh uses `getImportedMemory()` instead of `getMemoryState()`, removing the O(chat length) count pass from MESSAGE_SENT/RECEIVED/EDITED/DELETED/UPDATED. No network call, world-info evaluation, cache hydration, or generation was added.
- Startup injects only compact settings CSS. Full archive/theater CSS remains code-owned and is inserted by `openOverlay()` only; no model-controlled CSS/URL is introduced.
- Firefly page size is 18 while the persistent library limit is unchanged; this reduces simultaneous animated DOM nodes without changing stored content.
- No new `fetch` wrapper, `eval`, `new Function`, `MutationObserver`, `requestAnimationFrame`, or recurring timer was introduced.
- Local Node benchmark (environmental, not an iPhone measurement): filtering 1200 archive rows against 240 tombstones dropped from roughly 615 ms median with per-row re-normalization to roughly 0.65 ms median with one operation-local Set index.

## r41.4 Character Profile / Relation Garden targeted review

- Scope: new `src/modes/relations.js`, role-group/profile persistence, archive grouping identity changes, relation mode generation/normalization, archive/Profile UI, deletion integration, release metadata and rebuilt runtime bundle. This was a changed-behavior review, not a repeat full-repository scan.
- Shared layer boundary: Character Profile generation receives only the target character card, current User Persona and a bounded World Info dry-run. It is explicitly forbidden from reading chat messages/Mxxx. Objective facts require allowlisted `sourceType`, exact sourceEvidence presence and a locally checkable value; explicit predefined {{user}} relationships in Persona/World Info are accepted as first-layer setting facts, while ordinary Persona biography alone does not create a relationship.
- Per-chat layer boundary: `MODE.RELATIONS` uses the current archive only. Every dynamic relation needs a valid Mxxx ID + anchor; non-user third-party names must additionally occur in the cited memory title/summary/anchors/participants. The shared layer is merged only for display and cannot grant archive evidence or write itself into another chat.
- Identity/deletion: an ordinary card text edit may reuse exactly one unambiguous auto group with the same name + avatar so different windows keep one Character Profile. Ambiguous matches fail closed. Deleting a character archive also removes its shared Profile but still does not call a chat deletion API or mutate chat正文.
- Rendering/network: relation node coordinates and SVG edges are code-owned finite numbers. Model/setting strings are escaped before HTML insertion. The new relation module adds no `fetch`, `eval`, `new Function`, `requestAnimationFrame`, `setInterval`, arbitrary URL or model-controlled CSS path; the profile avatar is resolved through SillyTavern's local thumbnail helper.
- Verification: generated bundle fingerprint matches 43 reachable source modules; 43 source JS files, entry and bundle pass syntax checks; regression suite passes 80/80.

Targeted conclusion: no new Critical / High / Medium security finding identified in r41.2 → r42 changed behavior.

## r40.2 Calendar notebook targeted review

- Scope: Calendar normalizer/prompt/UI, Calendar note/mood granular management, Calendar derived-session version gate, release metadata and rebuilt runtime bundle.
- New display data: `stickyNotes` and `moodNotes` are derived cache only. Archive-backed notes/moods are rejected unless their memory ID + anchor resolves against the current formal archive; setting-backed sticky notes contain no memory IDs and remain labeled as setting reminders.
- To-Do authority is unchanged: open tasks are rendered from existing validated `promised` Calendar rows, so the new notebook UI does not add a second completion state or a path to mark promises fulfilled manually.
- Granular management reuses the existing allowlist, two confirmations, writable current-archive gate, model validation and chatId/archiveRevision save fence. Note/mood regeneration preserves evidence/source identity and only replaces bounded text fields.
- Canonical/network boundary unchanged: no new `MEMORY_KEY` write, provider transport, credential read, arbitrary URL, command execution, `eval`, `new Function`, XMLHttpRequest, WebSocket or EventSource path.
- Rendering: all model/setting-derived note/mood/title/source strings are escaped before the existing Calendar `innerHTML` sink.

Targeted conclusion: no new Critical / High / Medium security finding identified in the r40.1 → r40.2 changed behavior.

## r40 targeted Calendar redesign review

- Scope: Calendar normalization/prompt/UI, Calendar single-item regeneration, Calendar derived-session version gate, release metadata and generated runtime bundle.
- Trust change: removes automatic promotion of every dated archive memory into visible Calendar. `past` rows now require model nomination plus existing memory-ID/anchor validation, and the date is taken locally from the anchored dated memory.
- Promise hardening: concrete future dates are accepted only when the cited archive evidence contains the same date representation; otherwise only `待定` is allowed.
- Canonical boundary unchanged: no new `MEMORY_KEY` write, no new network transport, no credential handling, no URL-bearing Calendar field.
- Rendering: all model/setting/reflection strings are escaped before the Calendar `innerHTML` sink.

## r39.1 Calendar home-entry targeted review

- Scope: `src/archive/library.js` plus release metadata/bundle rebuild.
- The change only surfaces the existing Calendar action on the archive-library landing screen. It reuses the existing `data-rmt-mode` / `data-rmt-generate-mode` dispatch and existing writable-archive guard.
- When no current formal archive exists, the generate button is disabled; no new MEMORY_KEY write, provider path, URL sink, command execution, or HTML trust boundary is introduced.

## r39 targeted diff review — single runtime bundle / calendar visibility / Phone incremental UI

- Scope: r38.1 (0.8.14) → r39 (0.8.15). Reviewed `index.js`, `src/ui/phoneView.js`, the generated `dist/heartbeatMemories.bundle.js`, and the dependency-free build script `tools/build-runtime-bundle.mjs`; documentation/test-only edits were also inspected.
- Startup delivery changes from a 42-module, ~959 KB reachable ESM graph with a measured import depth of 22 to one versioned runtime bundle. The modular `src/` tree remains authoritative for review/tests; the release bundle embeds a SHA-256 fingerprint of all 42 reachable source modules and a test recomputes that fingerprint to prevent stale generated output.
- The r38 one-time `localStorage` + `location.reload()` module-refresh mechanism is removed. `index.js` now imports only `dist/heartbeatMemories.bundle.js?heartbeat=<build>`, so release cache-busting no longer depends on query-less child modules and does not add a page-navigation side effect.
- The new Phone toolbar button is code-owned static HTML. It invokes the existing `data-rmt-action="regenerate"` path, so the established writable-archive gate, incremental-memory check, provider coordinator, chatId/archiveRevision fence, and existing Phone normalizer remain authoritative. It adds no new cache/write authority. Read-only snapshots render a disabled button.
- Runtime capability parity check (r38.1 modular source → r39 generated bundle): `eval` 0→0, `new Function` 0→0, `XMLHttpRequest` 0→0, `fetch()` 5→5, `innerHTML` sinks 38→38, Connection Manager `sendRequest` 1→1, SlashCommand execution 2→2, formal `MEMORY_KEY` write sites 1→1.
- The build script reads only repository-local `src/**/*.js`, rejects external/unsupported import/export syntax, does not execute source code while building, and fails if a referenced local module is absent. It is not loaded by SillyTavern at runtime.
- Focused verification: all source JS and generated bundle pass `node --check`; bundle imports successfully as ESM; source-fingerprint test passes; Calendar first-screen shortcut and explicit Phone incremental button are present in both source and generated bundle; the complete regression suite passes 63/63.
- Conclusion: no new Critical / High / Medium issue identified in this diff. Remaining uncertainty is real-device/cloud-host timing; the code evidence proves request fan-out is removed, but only the user's cloud deployment can measure the exact wall-clock improvement.

## r21 targeted diff review — archive grouping / banned phrases / room layouts

- Scope: local r20 → r21 only. Reviewed archive-index grouping/migration, ambiguous legacy same-avatar handling, manual classification UI/actions, archive delete/index-remove actions, live-origin matching, task scope identity, generated-phrase enforcement, and room rendering/prompt changes.
- New/current archive index rows persist only a non-reversible local card fingerprint hash in addition to existing lightweight metadata. Automatic grouping prefers that fingerprint, so two cards with the same displayed name/avatar can remain separate when their card content differs; legacy rows without a fingerprint fall back to avatar+name and can be manually split.
- Archive classification writes only `heartbeatMemoriesArchiveIndexV1` plus lightweight `heartbeatMemoriesArchiveGroupsV1` metadata. It does not move, rename, delete, or rewrite SillyTavern chat files and does not mutate `MEMORY_KEY`/derived caches or grant write authority.
- Manual “new group” requires a user-selected SillyTavern character; manual move locks the row against later automatic reassignment. No host character/chat navigation was added.
- Legacy scans fetch each unique avatar once. If an old row has no fingerprint and multiple same-avatar/same-name cards are plausible, the scanner does not guess: it assigns a per-archive “待手动分类” presentation group until the user explicitly moves it.
- Actual archive deletion is live-current-chat only, double-confirmed, and rechecks runtime character identity + chatId before deleting Heartbeat metadata. It removes only Heartbeat archive/cache/runtime state and the lightweight index row; it never deletes/clears host chat messages. Non-live historical rows can only be removed from the library index.
- Cache compression persistence now revalidates the live archive and matching chatId/archiveRevision immediately before writing, so an in-flight gzip cannot resurrect CACHE_KEY after an explicit archive delete or revision change.
- Default banned generated phrase is `老子`. The Prompt asks the model not to use it; parsed derivative JSON is checked locally before normalization/save. Evidence-anchor fields are exempt so archived verbatim evidence remains byte-for-byte unchanged. Violations fail closed and do not auto-retry.
- Room diversity maps normalized room type/label to a fixed code-owned scene class plus one of three deterministic layout variants, and adds code-owned room-type props (e.g. studio monitors, bookshelves, bath fixtures, dining chairs, plants). Model output still cannot supply CSS/HTML/script/URL or arbitrary positioning.
- Focused smoke tests cover same-name/same-avatar cards with different fingerprints, ambiguous legacy rows, manual group creation/move, archive deletion metadata-only behavior, banned-phrase rejection with evidence-anchor exemption, and distinct room scene/layout mapping.
- No formal hosted Codex Security scan was available in this environment; this is a targeted manual diff review following Codex Security diff-review invariants.


## r18 targeted manual diff review — r17 audit follow-up

Scope: local r17 package SHA-256 `60f7926aee15223cecf8c88a7eb67ee1a0cab2b6735a2b549e7661ae773e352e` -> local r18 patch. This is a targeted Codex-Security-style manual diff review in this host, not a formal hosted Codex Security scan.

- Addressed audit R-1 by removing the ignored `preserveMode` argument from `showIndexedArchiveSnapshot`.
- Addressed audit R-2 by counting ordinary requests, mode-build reservations, ADV bulk/repair reservations, and CG/daily-strip image tasks in one logical admission set. ADV batch/repair and room-life now perform a front-door capacity check; `requestJson` retains an independent send-time gate.
- Addressed audit R-3 without weakening upgrade durability: shutdown still writes the complete raw fallback cache; caches over ~2M JSON characters only emit a console warning and are never selectively truncated.
- Addressed audit R-4 by renaming the overview route to `openArchiveSnapshotFromOverview` with an explicit no-host-navigation comment.
- Addressed audit R-5 by updating SECURITY.md to include the explicit “扫描记忆 / 摘要” preflight as an authorized external-memory trigger.
- Hardened audit R-7: dynamic third-party public memory reader execution now requires a separate explicit opt-in setting and defaults off. Passive prompt/metadata summaries remain available without executing third-party methods.
- Audit R-6 was checked against SillyTavern's public `SlashCommand` contract: callbacks explicitly accept `NamedArgumentsCapture`. Heartbeat now routes these calls through one helper that intentionally supplies only that public capture shape and does not fabricate parser-private scope/flags/controller objects. The current official `imagine` callback uses the named arguments plus trigger and remains compatible.
- Audit R-8 remains same-origin host behavior; UI/security documentation now states that custom Chat Completion headers may be passed to SillyTavern's hard-coded local model-status backend and are not persisted by Heartbeat.
- No automatic `selectCharacterById`, `openCharacterChat`, `reloadCurrentChat`, or `clearChat` path was introduced. No new arbitrary fetch target, WebSocket/EventSource, eval/new Function, secret-value storage, or external image URL acceptance was introduced.

Targeted conclusion: no new Critical / High / Medium security finding identified in the r18 audit-follow-up diff. Real SillyTavern validation is still required for provider-specific Image Generation behavior and third-party memory readers after explicit opt-in.

## r17 targeted manual diff review — archive write gating / isolated confession refresh / 5-task concurrency

Scope: exact current GitHub `src/heartbeatMemories.js` r16 blob `5873a4d8cdfa8f6bb29e6f81828c4070b0435ddf` -> local r17 patch. This is a targeted Codex-Security-style manual diff review in this host, not a formal hosted Codex Security scan.

- Removed the r15/r16 explicit host-navigation implementation from the read-only toggle: r17 contains no `selectCharacterById` or `openCharacterChat` call. Toggling read-only changes Heartbeat UI state only.
- Cross-archive snapshot write actions are gated by an exact live-context match (`characterKey + chatId + current MEMORY_KEY`). If the user has not manually opened that chat, the operation is rejected without host navigation. If a mode has no hydrated live session, the snapshot is not used as a substitute for write-back.
- ENDING confession refresh is a dedicated request with its own bounded task key. It normalizes the returned list through the same `normalizeMemoryReference` ID+anchor validator and merges only `confessionReplays`; existing endings/epilogues are preserved.
- Main generation concurrency increases from 4 to 5. Admission now counts the union of active request keys and mode-build scopes, closing the rapid-click window where several modes could pass admission before their request objects were registered.
- Image Generation re-detection only re-reads the already-registered local `imagine` command and rerenders Heartbeat UI. It adds no fetch/provider endpoint, secret read, or automatic image request.
- Added-line review found no new `fetch(`, XMLHttpRequest, WebSocket, EventSource, `eval(`, `new Function`, Authorization/API-key read, external network destination, or arbitrary DOM execution path.

Targeted conclusion: no new Critical / High / Medium security finding identified in the r17 changed behavior. Residual compatibility risk is limited to SillyTavern runtime timing (manual chat opening/cache hydration) and third-party Image Generation initialization; both fail closed rather than writing snapshot data into an unmatched chat.

## r16 targeted manual diff review — HEART / seasonal drama / daily strip / reverse confession

Scope: local r15 package -> local r16 patch. This is a targeted Codex-Security-style manual diff review in the current host, not a formal hosted Codex Security scan.

- Added `MODE.HEART` only as a derived session. Relationship tone requires a validated archive anchor; generated greetings, Voice Drama, Scenario Drama, and daily-strip scripts remain non-canonical simulations and never write `MEMORY_KEY`.
- Avatar clicks do not add a network destination or model call. For another character/history row they reuse the existing allowlisted same-origin archive snapshot loader, and they do not call `selectCharacterById/openCharacterChat`. Missing HEART content requires a separate explicit user generation action on the live current chat.
- The only new persistent global state is a bounded map of character key -> last avatar-visit timestamp. It carries no archive text, prompt content, credentials, URLs, or model result.
- Daily-strip drawing reuses the existing `imagine` provider path and same-origin image URL validator. The visual prompt is capped/sanitized and explicitly excludes text/speech bubbles; the stored image record remains path/prompt/provider/timestamp only.
- Reverse-confession availability remains model-proposed but is constrained by required archive memory IDs/anchor and future-simulation semantics; the prompt prohibits coercion and ungrounded third-party romance facts.
- No new direct provider API client, arbitrary fetch destination, WebSocket/EventSource, eval/new Function, Authorization/API-key read, or new secret storage was introduced by this patch.

Targeted review conclusion: no new Critical / High / Medium finding identified in the r16 changed behavior. Residual compatibility risk remains in third-party Image Generation runtime/provider behavior and in model completeness for the larger HEART JSON; both fail without lowering the archive evidence boundary.

## r15 targeted diff review — read-only edit transition + confession replay

Scope: r14 -> r15. The change adds an explicit user-controlled transition from read-only indexed archive snapshots into the corresponding real SillyTavern chat, and adds evidence-bound confession replay data/UI inside ENDING.

- Read-only remains the default for cross-archive snapshots. Disabling it requires a local checkbox action plus a fixed confirmation dialog; no model/archive/worldbook text can trigger the transition.
- Editing a historical snapshot never writes directly through the metadata snapshot. The plugin explicitly opens the indexed character/chat only after user confirmation, then verifies characterKey + chatId + current archive before exposing write actions.
- Active background tasks block the transition. Regeneration remains separately confirmed and keeps existing chatId/archiveRevision origin checks.
- Confession replays are normalized through normalizeMemoryReference and may be empty. They do not relax ENDING route evidence or turn future simulation into archive truth.
- No new arbitrary network target, credential read, eval/new Function, WebSocket or EventSource path was introduced.

## 0.8.10 confirmation / current archive r10 focused diff review

Scope: exact current GitHub `main` r9 blob `24312b4f9980c4d41fd318a6fe7eb830873b1e25` → local r10 candidate (`src/heartbeatMemories.js`, cache-key metadata, docs).

- Added a local, fixed-string confirmation gate for every explicit overwrite path: portal-level regeneration, topbar regeneration, room “今日生活” forced refresh, and current-window archive create/update. Cancel returns before any generation/import request is started.
- Restored a direct “生成/更新当前窗口档案” action in plugin settings and made current-window archive actions visible on the archive-library home whether an archive already exists or not. The existing chooser action is retained and renamed explicitly to “当前窗口档案”.
- Updating an existing archive now warns before action that a new `archiveRevision` will invalidate the old derived theater cache. This matches the pre-existing `saveImportedMemory()` behavior; the patch does not change cache invalidation semantics.
- Confirmation title/body strings are local constants. No model output, world-info text, archive text, HTML, URL, or secret data is injected into the confirmation surface.
- Static diff found no increase in `fetch(`, WebSocket, EventSource, `eval(`, `new Function`, `document.write`, or `insertAdjacentHTML`. No new network destination or credential-handling path was added.
- Counts of `expectedChatId`, `expectedArchiveRevision`, `normalizeMemoryReference`, `isCurrentTaskOrigin`, and `saveSession` are unchanged from the exact GitHub r9 baseline.
- `importCurrentChatMemory()` is now invoked only through the confirmation wrapper from user-facing actions; the implementation of archive import, external-memory scoping, origin binding, and archive write checks is unchanged.

Result: no newly introduced Critical / High / Medium issue found in this targeted r9 → r10 review. Native browser confirmation behavior still needs real-device UX validation, but failure to display confirmation is fail-closed: the destructive action is cancelled.

## 0.8.10 ending / epilogue r9 focused diff review

Scope: r8 → r9 (`src/heartbeatMemories.js`, cache-key metadata, docs).

- Removed the entire Gallery external-media chain: world-info URL extraction/cache, `imageUrl` normalization, preview state, image preview DOM, click handlers, and third-party `<img>` loads. This is a net reduction in browser network/privacy attack surface.
- Added `MODE.ENDING` as a normal archive-derived session. It uses the existing generation task/origin pipeline and the unchanged `saveSession` chatId + archiveRevision guard.
- Current relationship classification requires a real archive ID + anchor, and every ending route also requires a real archive ID + anchor. Future ending/epilogue prose remains simulation-only and is not written to the formal archive.
- Added strings continue to be rendered through `esc()`; no HTML/CSS/JS returned by the model is executed.
- Static diff found no newly added `fetch`, WebSocket, EventSource, `eval`, `new Function`, secret/API-key read, or external URL target. Existing same-origin Connection Manager/model-list and archive APIs are unchanged.
- Counts of `expectedChatId`, `expectedArchiveRevision`, `isCurrentTaskOrigin`, `saveSession`, and `archiveRevision` are unchanged from r8; `normalizeMemoryReference` usage increased because ENDING adds more evidence checks.

Result: no newly introduced Critical / High / Medium issue found in this targeted r8 → r9 review. Runtime validation is still needed for model compliance with the new ENDING schema.

## 0.8.10 r7 butterfly semantics delta

- Scope: `src/heartbeatMemories.js` butterfly prompt/normalizer/renderer plus resource cache keys and changelog.
- No new network endpoints, `fetch`, WebSocket, dynamic code execution, or credential/secret handling.
- Existing `normalizeMemoryReference`, chat/revision origin guards, archive storage boundaries, and generated-string escaping remain unchanged.
- Ω now clears `sourceMemoryIds/sourceMemoryAnchor` because it is a post-simulation current-world observation point, preventing simulated branch content from being presented as archive evidence.
- Rendered model strings remain passed through `esc()`.

## 0.8.10 mobile UI r6 — targeted diff review

- Scope: responsive CSS plus one presentation-only `rmt-character-portals` class and resource cache key.
- No generation, archive persistence, cross-chat guards, evidence validation, connection profiles, secrets, or network behavior changed from r5.
- No new `fetch`, `WebSocket`, `eval`, or `new Function` use was introduced.
- r5 mobile archive open/top-layer behavior is unchanged.

# Codex Security Targeted Diff Review — 心跳回忆 0.8.9

日期：2026-08-22

## 范围与基线

- 仓库：`Zaiyebuzuoyouqingdetiangou/tokimemo`
- GitHub `main` 当前版本：0.8.7
- 当前 `main` 提交：`3a4bd4d9373edca2e4ca8a4e98f5add22f283a4d`
- 0.8.9 开发基线：本地已验证的 0.8.8 候选
- 目标：本地 0.8.9 候选

本文件是针对 **0.8.8 → 0.8.9** 的定向差分安全复核，并结合当前 GitHub 0.8.7 正式基线确认兼容边界。当前会话没有 Codex Security 托管扫描执行器，因此不把本文件表述为完整服务端扫描。

## 0.8.9 主要变更

1. **移除“一次请求生成整套档案室内容”**
   - 回忆相簿、他的房间、蝴蝶效应分别由各自入口显式生成。
   - CG/ADV 的事件索引仍来源于相簿；具体 ADV 正文继续在用户点击某一事件后独立生成。
   - 他的物品 / 私人终端继续只从“他的房间”内部进入，并在缺失时由房间内显式按钮单独生成。

2. **引入有界并行生成任务注册表**
   - 内容生成使用独立 `activeGenerationTasks`，不再共享单一全局 AbortController。
   - 最大同时运行 4 个内容生成任务。
   - 每个任务有独立 AbortController、任务 key、发起时 character/chat/archiveRevision origin。
   - 同一任务 key 不允许重复启动。

3. **任务身份绑定聊天窗口**
   - 主入口任务 key 按 `character + chatId + mode` 分隔；不同聊天窗口同一模式不会互相误判为“正在生成”。
   - 任务完成后仍按发起时 chatId / archiveRevision 保存；当前已切换到别的聊天时进入延迟回写，而不是写入当前聊天。

4. **并发延迟回写的 lost-update 修复**
   - 多个模式在用户离开原聊天后先后完成时，`sessions` 类型延迟回写按 mode 合并，而不是后完成者覆盖前完成者。

5. **互斥边界**
   - 创建/更新正式档案、显式“读取记忆插件”预读取仍与内容生成互斥，避免生成过程中 archiveRevision 被改变。
   - 完整 ADV 索引重生成与具体 ADV 正文生成不并发，避免相同 ADV session 的覆盖竞争。
   - 房间基底重生成与房间 daily-life 更新不并发，避免旧生活状态覆盖新房间。

6. **房间深层内容上下文**
   - 物品 / 私人终端的独立请求只接收已校验的当前房间结构摘要；房间结构作为不可信数据输入，不作为模型指令执行。
   - 物品仍受 sourceMemoryIds/sourceMemoryAnchor 证据校验；独立生成不放宽共同回忆事实边界。

## 安全边界复核

- 并行请求数硬上限为 4，避免用户连续点击造成无界请求风暴。
- 同一入口重复点击不会创建重复任务。
- 关闭档案室 / 切换聊天不会把任务重新绑定到新聊天；销毁扩展时会逐一 abort 所有内容任务。
- 延迟回写仍要求原 chatId 与 archiveRevision 匹配，不允许旧结果覆盖已更新档案。
- 多任务延迟完成时，session 结果按 mode 合并，避免合法并发结果互相丢失。
- 0.8.8 的档案版本兼容、gzip 缓存大小限制、解压上限、损坏缓存熔断仍保留。
- Connection Manager / SillyTavern Secrets 边界未改变；没有新增读取明文 API Key 的路径。
- 本次差分未新增第三方浏览器网络目的地；现有网络调用仍为既有 SillyTavern same-origin API / 既有记忆 provider 路径。
- 静态检查未发现新增 `eval`、`new Function`、`document.write`、`insertAdjacentHTML`、`WebSocket`、`EventSource` 执行面。
- 模型输出继续通过各模式结构化 normalizer 与文字转义后展示，不执行模型返回 HTML/CSS/JS。

## 失败隔离收益

旧的一键整包请求把多个大型 schema 放入一个 JSON 响应：任一子区块缺字段、输出被截断或顶层 JSON 无法解析，整次生成都可能失败。0.8.9 将其拆成独立请求后：

- 一个入口失败不会使其他已成功入口失效；
- 重新生成某入口不会删除其他入口缓存；
- 每个响应输出预算更聚焦，降低长 JSON 截断与跨区块格式污染概率；
- 用户可按需要并行启动最多 4 个入口，而不是依赖一个超长响应。

## 差分复核结论

在本次 **0.8.8 → 0.8.9** 变更范围内，未发现新增的 **Critical / High / Medium** 安全问题。

## 仍需真实 SillyTavern 运行时验证

- 不同模型供应商 / 代理是否允许同一个 Connection Manager profile 同时存在 2–4 个请求；服务端可能限流或主动取消并发请求。此类失败会被隔离到对应入口，不应造成跨聊天写入。
- 低性能设备同时启动 4 个大型响应时的内存峰值需要实机观察；因此并发数没有设计成无限制。
- 历史 M6：一键导入当前 Connection Manager 配置涉及 SillyTavern slash-command callback 行为，仍需要真实 SillyTavern 环境验证。


## 0.8.9.1 startup hot-path review

- Ordinary `CHAT_CHANGED` / `CHAT_LOADED` no longer schedules legacy-cache gzip migration.
- Legacy cache remains read-only compatible on normal chat entry; no deletion or schema migration is performed.
- Mount retry performs only missing mounts and cannot repeatedly rebuild already-mounted API controls.
- No new network endpoint, dynamic code execution sink, secret read, or cross-chat write path was introduced by this hotfix.

## 0.8.10 mobile/avatar r4 targeted diff review

Scope: `0.8.10 prompt-r3 -> 0.8.10 mobile-avatar-r4`.

- Mobile archive-open fallback is limited to the two plugin-owned archive buttons and adds `touchend` alongside existing `pointerup`/`click`; it does not install a general touch interceptor.
- Character-avatar recovery only reads SillyTavern's existing `characters` metadata / archive-index metadata and still renders the resolved thumbnail URL through HTML escaping.
- A transient empty avatar can no longer overwrite a previously valid archive-index avatar. Existing entries with a usable avatar filename in `characterKey` can be recovered without rewriting memory text.
- `currentCharacterKey` keeps the same character-id fallback behavior used by task-origin isolation; the avatar repair does not replace security identity with character-name matching.
- No new `fetch`, WebSocket, dynamic-code execution, secret/API-key handling, raw-memory persistence, or external network destination was added.
- Counts/usages of `expectedChatId`, `expectedArchiveRevision`, `normalizeMemoryReference`, `isCurrentTaskOrigin`, and `saveSession` are unchanged from prompt-r3.
- The UI stylesheet block is byte-identical to prompt-r3; this hotfix does not alter the restored 0.8.9.1 visual baseline.

Targeted diff conclusion: no newly introduced Critical / High / Medium security issue found in this r4 change set. Real mobile-cloud browser behavior still requires device runtime verification because browser gesture synthesis differs across WebKit/Chromium wrappers.

## 0.8.10 UX / phone r8 focused diff review

Scope: `src/heartbeatMemories.js`, `manifest.json`, `index.js`, `CHANGELOG.md`, and `SECURITY.md`, compared with the r7 / current-GitHub functional baseline.

- Room rendering was reordered and de-overlapped without changing `normalizeRoom`, memory-reference validation, task origin binding, or session write scope.
- ADV mobile selection only accepts IDs already present in the current normalized `session.events`; the new top-level back path changes local view state only.
- Phone output is intentionally richer, but all `basis=记忆` entries still pass the unchanged `normalizeMemoryReference` ID + anchor check. Modern-phone core App counts (including location + persona-specific App), contact-detail depth, and 3×12-round deep-chat depth are now locally validated; one full regeneration retry is allowed if the first output is incomplete. Compact watch/communicator devices still have a higher richness floor (8 entries/apps minimum structure, 48 readable entries total) without forcing impossible modern-only features.
- The only new external-media surface is Gallery preview. A URL is retained only when it is valid http(s) and exactly matches a URL extracted from the current chat scope's already-activated `WORLD_INFO_TEXT`; the model cannot invent a new target. The image is not loaded until the user clicks the preview control and uses `referrerpolicy="no-referrer"`.
- No new `fetch()`, WebSocket, `eval()`, `new Function`, secret-value read, or cross-chat write path was added.
- `normalizeMemoryReference`, `saveSession`, `isCurrentTaskOrigin`, `captureTaskOrigin`, `requestJson`, `queueDeferredCommit`, `normalizeButterfly`, `normalizeAlbum`, `normalizeRoom`, and `normalizeItems` are byte-identical to r7.

Result: no new High/Medium security finding identified in this focused diff. Residual privacy note: if the user explicitly opens an allowlisted third-party Gallery image, that image host necessarily receives a network request from the browser; Referrer is suppressed and the load is never automatic.

## r11 memory-adapter delta

- Added only current-chat-scoped generic readers and summary adapters; no cross-chat index is used as evidence.
- Generic global discovery uses property descriptors and data-value method checks; it does not execute arbitrary getters while probing provider APIs.
- Chat metadata extraction traverses only summary/memory-labelled top-level keys and a fixed allowlist of content fields.
- World info, character cards, personas, and author-setting material remain setting-only context and are explicitly excluded from external-memory import evidence.
- External imported memories still require an existing externalId and an exact sourceExternalAnchor contained in the cited source content.

## r12 CG image-generation targeted diff review

Scope: exact GitHub r11 baseline (`src/heartbeatMemories.js` blob `576fc7e234eda448a2f9aa7ee2e0c25740edf61f`) to local r12 CG-image patch.

- No direct image-provider endpoint, credential read, or provider-specific API client was added. Heartbeat calls only the already-registered SillyTavern `imagine` slash-command callback with `quiet=true` / `gallery=false`.
- CG drawing is an explicit user action with a cost/credit warning. It is never started by opening an album/ADV, selecting a card, a timer, or background archive generation.
- The outgoing prompt is capped and sanitized. URL-like content, `{{...}}` macro syntax, source-memory field names, world/memory envelope labels, and HTML-like tags are stripped before the visual prompt reaches Image Generation. The full chat, archive records, world-book text, external-memory records, phone contents, and secrets are never passed to the image command.
- The returned image reference is accepted only when it resolves to the current SillyTavern origin using http(s). `data:`, `blob:`, and cross-origin URLs are rejected. The DOM receives only an escaped same-origin path with `referrerpolicy=no-referrer`.
- The cache stores only `{url,prompt,provider,generatedAt}`; no base64 image bytes are stored in `chatMetadata`. Invalid/broken image loads fall back to the existing abstract CG layer.
- A CG draw captures `characterKey + chatId + archiveRevision`, rejects stale completion, uses the latest cached session before merging the image field, and blocks whole-mode regeneration while that mode has an image task. This avoids stale image completion overwriting a newer ADV/session snapshot.
- Plugin destruction increments a lifecycle epoch and clears local image-task state; a late external image result cannot write into the destroyed instance. Archive create/update and memory preflight treat an active CG draw as an active generation task.
- Added-line scan found no new `fetch`, `XMLHttpRequest`, WebSocket, EventSource, `eval`, `new Function`, Authorization header, API-key read, or direct `/api/` destination.

Targeted diff conclusion: no new Critical / High / Medium issue identified in the r12 change set. Residual runtime dependency: compatibility and billing behavior depend on the user's installed SillyTavern Image Generation configuration; the first build intentionally supports the registered `imagine` capability rather than probing arbitrary third-party plugin internals.


## 0.8.10 state-r13 targeted diff review

Scope: r12 CG-image package -> r13 state/archive patch. Changed source: `src/heartbeatMemories.js`; packaging/docs: `manifest.json`, `index.js`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

Security-sensitive changes reviewed:
- Incremental archive updates preserve old Mxxx records verbatim and only migrate derived-session `archiveRevision` fences when the old archived chat prefix still hashes to the previous chat fingerprint. If old messages changed, incremental update fails closed and requires explicit full rebuild.
- Full rebuild remains destructive and clears derived content; it now has a separate explicit confirmation path.
- Cross-archive viewing no longer invokes host character/chat switching. It reads only the indexed character's same-origin `/api/characters/chats` metadata on explicit user selection and renders a read-only snapshot. Snapshot mode blocks generation, CG redraw/clear, archive updates and room-life regeneration.
- Compressed cache read failures no longer degrade to an empty “not generated” state. The compressed metadata is left intact and the UI surfaces a recovery error.
- ADV partial batch generation no longer automatically fans out into multiple model requests. Individual repair requires an additional explicit confirmation with the maximum request count.
- No new arbitrary network destination, WebSocket/EventSource, eval/new Function, secret storage, or model-controlled fetch target was introduced. The only new runtime fetch reuses the pre-existing same-origin `/api/characters/chats` archive-metadata endpoint with a locally indexed avatar/chat target.

Result: no newly introduced Critical/High/Medium security finding identified in the targeted manual diff review. Runtime compatibility of server-returned chat metadata fields and browser compression APIs still requires real SillyTavern device testing.
## 0.8.10 cg-ui-r14 targeted diff review

Scope: r13 state/archive package -> r14 CG discoverability patch. Changed source: `src/heartbeatMemories.js`; packaging/docs: `manifest.json`, `index.js`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

The patch changes presentation and the classification of one indexed archive case. An indexed row is promoted to the live current archive only when its canonical character key and chat id both match the already-open SillyTavern context and that context already contains the corresponding Heartbeat Memories archive. No character/chat selection method is invoked. Other indexed archives remain snapshots and retain the existing write-action block.

The new album-card paint shortcut reaches the same `drawSelectedCgImage()` path as the existing detail button. It therefore retains explicit billing confirmation, one-image concurrency, visual-prompt sanitization, same-origin local-image-path validation, and task-origin / archive-revision checks. No direct provider API, arbitrary URL load, secret read, or background image generation was added.

Targeted diff conclusion: no new Critical / High / Medium issue identified in the r14 change set. Residual dependency remains the user's configured SillyTavern Image Generation provider and its billing/runtime behavior.



## 0.8.10 memory-worldinfo r19 targeted diff review

Scope: r18 audit package -> r19 memory-related world-info selector.

- Added an explicit current-chat selector for companion worldbooks used to interpret memory-plugin summaries. Users may select a whole book or exact entry UIDs. The selection is stored in chat metadata as names/mode/UIDs only; raw worldbook content is not persisted by Heartbeat.
- Selected worldbook text is **context-only**, not evidence. It is appended only to the external-memory extraction prompt, cannot supply sourceExternalId/sourceExternalAnchor, and cannot generate an archive memory without a real current-chat external-memory record that passes the unchanged exact-anchor validation.
- Book names are allowlisted via SillyTavern public `getWorldInfoNames()` and read only through public `loadWorldInfo(name)`. The patch adds no direct fetch, external endpoint, credential read, host-chat navigation, or dynamic-code execution sink.
- World-info input is bounded to 8 books / 160 entries / 52k characters so an external-memory chunk plus its explanation context remains under the existing 96k input-character safety envelope.
- Changing any whole-book or exact-entry selection invalidates the current chat's preflight cache. The selector metadata key is excluded from generic chat-metadata summary discovery so it cannot recursively identify itself as memory content.
- Dynamic worldbook/entry labels and previews are escaped before HTML insertion; worldbook entry objects are read through data-property-safe helpers.

Targeted manual diff conclusion: no new Critical / High / Medium issue identified. Real SillyTavern device testing is still needed for large-worldbook UI ergonomics and the exact runtime return shape of installed-version `loadWorldInfo()`.


## 0.8.10 json-output-r20 targeted diff review

Scope: exact r19 package / GitHub-main source blob `3a962f8878dc8eb4214b986bbd2a08f26ae7739a` -> local r20 JSON-output patch.

- The previous archive-import `maxTokens: 4096` cap was removed. Archive chat/external-memory chunks request up to the user's configured limit, hard-capped at 30,000; the default user setting remains 16,384 so upgrades do not silently increase an existing user's spend ceiling. Main mode caps were raised to the same 30k ceiling but `generateConfiguredJson()` still takes `min(settings.maxTokens, requestedMax)`.
- JSON extraction no longer takes the substring from the first `{` through the last `}`. A quote/escape-aware balanced-object scanner considers complete top-level objects and parses the last valid one, which tolerates fenced JSON and surrounding prose without accepting an unclosed/truncated object.
- Empty final content, reasoning-only finalization, no JSON object, truncated JSON and invalid JSON are classified separately. Diagnostics expose only error type and character counts; reasoning/content text is not logged or persisted by the new code.
- Archive chunk retry is explicit and bounded: only a `retryableJson` error offers one native confirmation; cancel sends no extra request, confirm sends exactly one retry of that same chunk, and a second failure propagates. The archive write still occurs only after every chunk has succeeded and local normalization/evidence checks complete, so the old archive/cache remains intact on failure.
- Structured archive extraction temperature is capped at 0.35 without changing the user's configured temperature for creative modes.
- Added-line review found no new `fetch`, XMLHttpRequest, WebSocket/EventSource, dynamic-code execution, secret/API-key access, host chat navigation, or new metadata write sink. Existing `characterKey + chatId + archiveRevision` write guards are unchanged.
- Focused runtime tests covered fenced/prose JSON, braces inside strings, multiple top-level objects, reasoning-only empty final content, truncated output, non-JSON output, explicit one-time retry, and cancel-with-no-retry. Syntax/import checks pass.

Targeted manual conclusion: no newly introduced Critical / High / Medium issue identified in this patch. Provider-side behavior when a model cannot support the requested output length remains a runtime dependency; such provider errors are surfaced rather than retried automatically.

## r22 ENDING / shared-album / Image Generation targeted diff review

Scope: r21 archive-room package -> r22 ending-album-image patch. Changed runtime source: `src/heartbeatMemories.js`; packaging/docs: `index.js`, `manifest.json`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

- ENDING is split into an evidence-backed route outline, a separate historical-confession scan, and one request per currently available route. The outline and final merged session still use the existing local memory-ID/anchor normalization; the change reduces model request size without weakening the archive evidence boundary. A route detail is rejected when its route ID changes, its terminal scene/confession is undersized, or fewer than three substantial epilogue scenes survive normalization. A route gets at most one bounded retry; persistent failure returns before the normal session commit, so the old ENDING cache is not replaced by a partial result.
- Album `comments` changed semantics and presentation only. They remain escaped model text attached to an already normalized CG item and do not become archive evidence or executable content.
- Image Generation capability discovery now accepts the public `/imagine`, `/sd`, or `/img` callback objects exposed by SillyTavern. Direct callback invocation remains the preferred path and bypasses the STscript parser entirely.
- The new manual fallback is explicit opt-in and uses only SillyTavern's public `executeSlashCommandsWithOptions` with the fixed `/sd quiet=true` command. Before parser entry, `{}` are removed, CR/LF are collapsed, backslashes are doubled, and `|` is escaped. A focused test used `{{getvar::secret}}`, a newline, `| /send`, and a backslash and verified that no macro braces, newline, or unescaped pipeline remained in the executed command.
- The r12 outgoing visual prompt sanitizer still runs before either image path, so URL-like text, memory/world envelope labels and HTML-like tags remain stripped. The patch adds no provider endpoint, credential/API-key read, arbitrary fetch target, dynamic-code execution sink, background image trigger, or cross-chat write path. Existing same-origin image URL validation and image-task origin/revision fencing are unchanged.
- Static syntax checks passed for `src/heartbeatMemories.js` and `index.js`. Focused normalization tests rejected an ENDING outline missing `open` and one with `route.available=false`; a direct `/sd` callback test preserved its parser-free callback contract while supplying only `quiet=true` and `gallery=false` named arguments.

Targeted diff conclusion: no new Critical / High / Medium security issue identified in the r22 change set. Residual runtime dependency: exact `/sd` registration and provider behavior vary by SillyTavern/Image Generation version; when automatic callback discovery fails, the parser fallback remains disabled until the user explicitly enables it.

## r23 stable segmented generation targeted diff review

Scope: GitHub-main r22 `ending-album-image` -> local r23 `stable-segments`. Runtime source change: `src/heartbeatMemories.js`; packaging/docs: `index.js`, `manifest.json`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

- The large ALBUM, PHONE and HEART outputs are decomposed into bounded child requests. ENDING keeps its r22 outline/detail split but runs the independent confession scan concurrently and generates available route bodies with a maximum of three sibling workers. Every child request still goes through the existing `requestJson()` / `generateConfiguredJson()` / Connection Manager boundary; the patch adds no provider endpoint, raw credential access, arbitrary fetch, Slash Command execution, dynamic-code execution, HTML execution sink, or host-chat navigation.
- Segmentation does not make partial model output authoritative. Album CG directory/evidence, album comment batches, phone plan/App details, HEART core/drama parts and ENDING route details are locally normalized before merge; the existing final mode normalizer runs again on the merged object. `generateMode()` still writes only after a complete session exists, then requires the original task origin and unchanged `archiveRevision`; otherwise the already-existing deferred-commit path is used. A failed child therefore does not save a half-built session over the prior cache.
- Child concurrency is bounded to three per segmented mode and remains under the pre-existing global generation-task gate. The concurrent mapper preserves deterministic result order and, after the first child error, stops scheduling additional siblings; already in-flight calls are allowed to settle. Child task keys derive from `safeId`-bounded model IDs where model-generated identifiers participate in a task key.
- PHONE's previous one-shot output required a very large device tree and also applied three 24-message deep chats to compact devices. r23 makes the device/App directory one evidence-light plan, then validates each App independently. `basis=记忆` entries still require valid current-archive memory IDs and anchors. Phone keeps three 24-message deep chats; terminal requires two; watch/communicator require one 12-message chat, matching their compact-device semantics instead of silently weakening phone requirements.
- Prompt-trust review found two hardening opportunities while implementing segmentation. Model-generated phone labels/device names are never interpolated into trusted instruction text; they are carried only in `UNTRUSTED_PHONE_DEVICE_JSON` / `UNTRUSTED_APP_PLAN_JSON`. ENDING route titles are likewise no longer interpolated into `promptSafetyBoundary()` labels. Retry instructions use a fixed local validation message rather than inserting model/error-derived prose back into the trusted prompt.
- ALBUM comments remain derivative present-day dialogue attached to already evidence-normalized CG rows and cannot become archive evidence. HEART Voice/Scenario material remains explicitly simulated and is never written into `MEMORY_KEY`. ENDING availability is still decided by the evidence-backed normalized outline before route bodies are requested.
- Static syntax checks passed for `src/heartbeatMemories.js` and `index.js`; `manifest.json` parses. Focused runtime normalization tests cover a 15/12/3 album index plus comment batches, HEART core + post/seasonal Voice + Scenario parts, a 10-App/65-entry phone including three 24-message deep chats, a compact watch with one 12-message deep chat, deterministic max-three concurrency, and stop-scheduling-after-first-error behavior. Added-line sink review found no new `fetch`, `XMLHttpRequest`, `eval`, `new Function`, HTML insertion, storage, Slash Command, `saveSession`, or deferred-commit sink.

Targeted diff conclusion: no newly introduced Critical / High / Medium security issue identified in r23. Residual runtime uncertainty is provider-side: some Connection Manager/provider configurations may rate-limit three concurrent long requests, and no live SillyTavern/provider integration environment is available in this review. Such failures remain bounded to their child segment and do not authorize a partial session commit.

## r24 request coordinator / confession player targeted diff review

Scope: local r23 `stable-segments` package -> local r24 `request-coordinator`. Runtime source: `src/heartbeatMemories.js`; packaging/docs: `index.js`, `manifest.json`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

- The r23 double-accounting path was reproduced from the actual task registry: a parent `activeModeBuildScope` and its differently named child requests were separate logical keys. With another mode active, an ENDING parent plus confession/route children could reach the five-task gate and reject a sibling request created by the same parent. r24 folds child task keys back to their longest active parent scope while preserving distinct child AbortControllers and labels.
- Provider traffic now crosses a FIFO permit queue capped at two active requests. Segmented ALBUM comments, PHONE Apps, HEART parts and ENDING route bodies are scheduled sequentially inside each mode. Queue waiters listen to their request signal and are removed on abort; permit release is idempotent and runs in `requestJson()` `finally` handling.
- `requestJson()` wraps the Connection Manager promise in a local 300-second lifecycle timeout (hard-clamped to 30–600 seconds). The local timeout rejects and releases task/permit state even if an upstream adapter ignores AbortSignal; the late promise already has resolution/rejection handlers and cannot commit a session. Timeout is deliberately non-retryable to avoid overlapping a possibly still-running provider request or charging the same segment twice.
- Connection failures are converted into bounded local categories for auth, rate limit, context limit, missing profile/model/endpoint, invalid request, upstream timeout/server failure, and unknown failure. User-visible messages include at most a numeric HTTP status or short code and do not include model content, prompt/context envelopes, response bodies, headers or credentials.
- Retry behavior is now allowlisted. JSON extraction and local segment validation, 429, and temporary upstream/server errors can retry the same segment once; authentication, configuration, context limit, invalid request, banned phrase, abort, and local lifecycle timeout do not. Completed segments remain in memory only until the final mode normalizer succeeds; the existing atomic session commit and origin/revision fences are unchanged.
- ENDING route detail adds `confessionLines` and keeps a derived legacy `confession` string. The player obtains the avatar only through `heartCharacterAvatarUrl()`, escapes avatar/name/text before HTML insertion, and performs old-cache sentence splitting locally. It adds no model-supplied URL, fetch, storage authority, chat write, world-info write, Slash Command, or dynamic execution sink.

Focused verification covered syntax/import parsing, parent/child logical-key folding, a two-permit maximum with FIFO release, queued abort removal, timeout rejection and permit/task release, non-retryable timeout/auth/context classes, one-time retry eligibility for validation/429/5xx, new confession line normalization, and legacy confession splitting. Full live provider integration was not available; actual upstream cancellation still depends on the Connection Manager adapter, while local waiting and writeback are bounded independently.

## r25 incremental important nodes / split HEART / achievements targeted diff review

Scope: r24 `request-coordinator` package -> local r25 `incremental-achievements`. Runtime source: `src/heartbeatMemories.js`; regression tests: `tests/requestCoordinator.test.mjs`; packaging/docs: `index.js`, `manifest.json`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

- Album and CG/ADV fixed-volume requirements were replaced with incremental important-node collection. Fresh rows are normalized before merge. Album's final merge goes back through `normalizeAlbum`; ADV merge was additionally challenged with a stale-cache case and now re-runs every retained row through `normalizeEventCandidate` against the current memory bank before preserving an old CG image or ADV body. A stale event whose current ID/anchor no longer validates is dropped instead of being kept authoritative by the merge key.
- ADV bulk text generation is capped at six events per provider request. Existing evidence-scoped `MEMORY_POOL_JSON` behavior is unchanged. The cap only selects the next unfinished/retry batch; it does not bypass normalization, task origin, archive revision, or session commit checks.
- ENDING avatar/dialogue playback moved from future route detail to evidence-backed confession replay. Route normalization no longer requires `confessionLines`; confession replay normalization still requires real current memory references. The player uses the existing local character-avatar helper and HTML-escapes character name and every generated line. No model URL is accepted for the avatar.
- HEART now permits a dialogue-only base session and independently generated seasonal/future Drama and daily strips. Each update re-runs `normalizeHeart` with the current memory bank before `saveSession`, then uses the existing current-origin plus unchanged-archive-revision fence; optional Voice/Scenario/strip data remains derivative simulation and does not write `MEMORY_KEY`.
- PHONE retains the fixed App-kind allowlist while reducing planned item/deep-chat counts. Review of the changed App prompt removed model-generated App label/kind interpolation from trusted instruction prose: the plan stays inside `UNTRUSTED_APP_PLAN_JSON`. Existing per-entry evidence normalization remains responsible for any claimed shared history.
- The new Achievement Library accepts only bounded plain-text fields plus a fixed tier enum. `unlocked=true` rows pass `normalizeMemoryReference`; locked rows do not receive authoritative memory references. Incremental merge is re-normalized against the current archive, so an old unlocked row cannot survive after its backing evidence disappears. Renderer review found all model strings passed through `esc()`, while icon classes come only from a local tier-to-icon mapping.
- Added-line sink review found no new arbitrary `fetch`, `XMLHttpRequest`, Slash Command execution, dynamic code execution, provider endpoint, credential/API-key read, model-controlled HTML/CSS/URL sink, world-info write, or host-chat navigation. The new session writes are HEART derivative updates and continue through the pre-existing writeability/origin/revision protections.
- UI simplification removes explanatory copy only. Read-only controls, explicit destructive confirmations, writable-archive checks, r24 two-provider permit queue, lifecycle timeout, retry allowlist, banned-generated-phrase policy, deferred-commit fencing, and existing image-generation boundaries remain present.

Focused verification: `node --check src/heartbeatMemories.js`, `node --check index.js`, `python -m json.tool manifest.json`, `git diff --check`, and the Node regression suite pass. The suite covers the six-ADV batch cap, parent/child request accounting, provider permit/abort/timeout behavior, safe error classification, route-vs-confession playback placement, small evidence-backed Album/ADV sets, stale ADV evidence removal during incremental merge, the ~33-entry 10-App phone plan, dialogue-only HEART persistence, and evidence-backed unlocked versus locked achievements.

Targeted diff conclusion: no newly introduced Critical / High / Medium security issue identified in r25. Remaining uncertainty is live integration only: no real SillyTavern Connection Manager/Image Generation provider is available in this local review, so provider-specific latency/format quirks cannot be reproduced here; failures remain bounded by the unchanged r24 request coordinator and atomic/deferred commit fences.

## r26 resumable phone / per-season Drama / compact settings targeted diff review

Scope: exact GitHub-main r25 `incremental-achievements` source blob `4497967996fd81be7925266557953c9c45fb349f` -> local r26 `lean-resume-seasons`. Runtime source: `src/heartbeatMemories.js`; regression tests: `tests/requestCoordinator.test.mjs`; packaging/docs: `index.js`, `manifest.json`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

- Settings cleanup removes presentation-only explanatory paragraphs. Connection/model selectors, max-output/temperature controls, banned-phrase policy, Image Generation opt-in, memory-reader opt-in, archive write guards and destructive confirmations remain present. The removed status target had only a guarded optional UI update, so its absence does not change request or credential behavior.
- HEART speaker labels now resolve from the current SillyTavern context or already-loaded archive snapshot. Both names and generated dialogue remain passed through the existing HTML escaper before insertion; the model cannot provide an avatar URL or display-name HTML fragment through this change.
- Seasonal Drama is stored one season at a time. Review found a stale-base race in the initial implementation: two different season buttons could have generated concurrently from the same old HEART session and the later commit could have discarded the earlier successful season. The patch was hardened so period dialogue, strips and every season share one `heart-section:<scope>` build guard. Users may generate each season independently, but same-chat HEART section writes are serialized; each successful update still re-runs `normalizeHeart` and the existing current-origin + unchanged-archive-revision fence before save/deferred commit.
- Phone continuation data is stored only under the existing Heartbeat derived cache, never `MEMORY_KEY`. A draft is accepted only for the exact current `chatId + archiveRevision`, and archive revision migration deletes it. Each completed App must first pass the existing completeness/evidence validator, then is copied through a bounded field whitelist before persistence. Unknown model keys and nested objects are dropped.
- The phone plan written into a draft is also bounded. During review, `liveStates` was tightened from a pass-through plan object to four code-known dayparts with bounded lock/status text and badge counts restricted to planned App IDs. This prevents the new resume cache from persisting arbitrary model-owned nested state. Resume re-normalizes both the plan and each saved App before skipping it, and the final device still passes full `normalizePhone` before becoming a session.
- Successful Phone session commit deletes the draft. A failure preserves only validated completed Apps and a short bounded diagnostic; the next room action resumes remaining App IDs instead of replaying completed requests. If the current chat or archive revision changes, the draft is ignored/deleted rather than rebound.
- Added-line sink review found no new outbound `fetch`/XHR, Slash Command execution, dynamic-code execution, provider endpoint, credential/API-key read, model-controlled HTML/CSS/URL sink, world-info write, host-chat navigation, or authoritative archive-memory write. The only new persistent write is bounded derivative phone-draft state inside the pre-existing Heartbeat cache.

Focused verification passed: `node --check src/heartbeatMemories.js`, `node --check index.js`, `python -m json.tool manifest.json`, `git diff --check`, and the 15-test Node regression suite. Coverage includes settings-copy removal, real-name rendering, single-season normalization without sibling seasons, shared HEART section serialization, ~33-entry phone planning, draft-field whitelisting, draft-plan badge/state bounding, existing provider queue/abort/timeout/error classification, evidence checks and prior r25 regressions.

Targeted diff conclusion: no newly introduced Critical / High / Medium security issue identified after the two hardening changes above. Remaining uncertainty is live SillyTavern/provider integration only: this environment cannot reproduce provider-specific latency, response-shape or mobile UI behavior, but resume and writeback remain bounded by the existing request coordinator and chat/revision fences.


## r27 concurrent seasonal Drama targeted diff review

Scope: r26 `lean-resume-seasons` -> r27 `concurrent-drama`. Runtime changes are limited to HEART task coordination, split seasonal prompts/validators, partial patch persistence, deferred HEART patch merging, and small UI state labels; tests/docs/package queries changed accordingly.

- The r26 root cause was confirmed: every season used the same `heart-section:${scope}` build key, so a second season was rejected before reaching the provider. r27 uses a fixed internal key family `heart-season:${scope}:${normalizedSeason}`; season is constrained to the code-defined five-value allowlist. This increases logical concurrency but does not increase the existing two-permit provider ceiling.
- Spring/summer/autumn/winter no longer ask one model response to contain both Voice and Scenario. Each segment has a fixed expected kind/season and passes `normalizeVoiceDramaPart` or `normalizeScenarioDramaPart` before persistence. Threshold reductions only accept shorter bounded plain-text scripts; they do not introduce new fields, sinks, URLs, commands, HTML, or archive evidence.
- Concurrent completion was reviewed for lost-update behavior. r27 persists normalized HEART patches rather than stale whole-session snapshots. Before a live write it reloads the latest same-chat session, applies only the relevant season component, re-runs `normalizeHeart`, verifies origin/revision, then uses the existing `saveSession`. Deferred patches are merged by internal patch key and revalidated on return to the original chat.
- Model output cannot control patch keys or target season: both are derived from the UI action after a five-value allowlist check. Patch payloads are objects already normalized by existing bounded text/script normalizers. No new `fetch`, XMLHttpRequest, Slash Command execution, dynamic code execution, provider endpoint, credential/API-key access, world-info write, host-chat navigation, or `MEMORY_KEY` write was added.
- UI partial state (`1/2`, `补全`) is computed only from normalized session arrays. Script rendering continues through the existing escaped HEART renderer and real-name label path.
- Focused verification covers independent season logical keys, the unchanged two-provider permit cap, smaller Voice/Scenario validators, sibling-season patch merge, legacy r26 regressions, syntax, manifest parsing, and ZIP extraction.

Targeted diff conclusion: no new Critical / High / Medium security issue identified in the r27 change set. Residual runtime dependency remains the selected Connection Manager/provider: five season tasks may be queued, but only two provider calls are intentionally in flight at once.
## r28 network-idle cache persistence targeted diff review

Scope: r27 `concurrent-drama` -> r28 `network-idle-cache`. Runtime changes are limited to cache persistence scheduling and the immediate uncompressed-cache fallback predicate; tests/docs/package queries changed accordingly.

- Root cause review found that partial generators call `saveSession` / phone draft persistence frequently. The theater cache can legally reach 12,000,000 source characters and 4,000,000 base64 characters after gzip. Each durable metadata write therefore has a potentially much larger network footprint than the small partial result that triggered it. r28 keeps partial results in the existing runtime cache and postpones gzip/chat-metadata persistence while any provider request is active or queued, coalescing repeated partial saves into the latest cache object.
- The provider queue itself is unchanged at a maximum of two permits. The new `shouldDeferCachePersistForProviderTraffic()` predicate observes only internal counters and cannot be influenced by model output. No new timer input, URL, fetch, provider endpoint, Slash Command, DOM sink, credential read, or archive write capability was introduced.
- Modern browsers with `CompressionStream` no longer perform the previous immediate raw-cache metadata write before the compressed write. Browsers without that API keep the old uncompressed fallback, preserving compatibility. This changes durability timing only; canonical archive memory is not moved into runtime-only storage.
- Delayed persistence still enters `persistCompressedCacheNow`, which rechecks current chat scope and `cacheStillMatchesLiveArchive`; a stale compression result after navigation/revision change is rejected or parked in the existing pending map. Removing the immediate raw write therefore does not weaken cross-chat or revision isolation.
- Focused regression tests verify that cache persistence is considered deferred while provider permits/queue entries exist, becomes eligible after the provider queue drains, and that modern `CompressionStream` environments do not choose the immediate uncompressed-cache path. Existing r27 provider, HEART partial-patch, phone draft, evidence and error-classification tests remain green.
- The HEART season-card review also corrected a UI-only state bug: `postending` has no Scenario payload, so the card may never derive a synthetic `1/2` state from the placeholder `hasScenario=true`.

Targeted diff conclusion: no new Critical / High / Medium security issue identified. Residual trade-off is availability/durability rather than security: if the page is force-closed before the provider queue becomes idle and the scheduled gzip flush runs, the newest derivative partial result can be lost from persistent metadata; the previous durable cache remains authoritative.

## r29 60k output ceiling targeted diff review

Scope: r28 `network-idle-cache` -> r29 `output-60k`. Runtime changes are limited to the bounded output ceiling, settings input maximum, and safe JSON-output budget diagnostics.

- The prior 30k behavior was confirmed to be local: `MAX_GENERATION_OUTPUT_TOKENS = 30000`, settings normalization used `Math.min(MAX_GENERATION_OUTPUT_TOKENS, settings.maxTokens)`, and the settings number input declared `max="30000"`. r29 changes the single absolute ceiling and UI maximum to 60,000, so a user-selected 60,000 survives normalization.
- The local JSON parser previously truncated both final content and reasoning at 240,000 characters. r29 raises that parser-only bound to 600,000 characters so a valid 60k-token response is not self-truncated before balanced-object parsing; the value remains bounded and does not affect prompt/input budgets.
- `generateConfiguredJson` still computes `responseLength = min(user setting, explicit segment request)`. Therefore a feature requesting 3,000 tokens remains capped at 3,000 even when the global setting is 60,000. No feature-specific segment was silently expanded by this patch.
- JSON empty/truncated diagnostics now receive only the already-computed numeric `responseLength` and normalized user setting. The new diagnostic text exposes numeric budgets only; it does not include the prompt, response body, reasoning body, credentials, headers, archive/world-info data, or provider secrets.
- The change adds no new network endpoint, request concurrency, retry, fetch/XHR, Slash Command execution, dynamic code execution, HTML/CSS/URL sink, credential/API-key access, host-chat navigation, world-info write, or `MEMORY_KEY` write. Existing provider errors remain authoritative when the selected model/proxy rejects a requested output size.

Targeted diff conclusion: no newly introduced Critical / High / Medium security issue identified. Residual operational risk is provider compatibility/cost: models or proxies may reject or bill for large output ceilings; the plugin remains bounded at 60,000 and retains smaller per-feature segment caps where defined.


## r33 clean build / display toggle / output-budget targeted diff review

Scope: r32 mobile-close package -> r33 clean build. Runtime changes use the direct SillyTavern Image Generation-only path, add a boolean TT layout toggle, restore user-selected secondary-API max output semantics, and expose HEART as a first-class archive portal before achievements.

- Image generation remains limited to SillyTavern public commands. Same-origin image URL normalization, explicit user draw confirmation, manual `/sd` sanitization and current-chat/revision writeback fences remain.
- TT mode controls only an internal CSS class and code-owned safe-area fallback; it does not accept model-controlled CSS, HTML, URL or script values.
- User max output remains clamped to 60,000 and is forwarded to the already-authorized Connection Manager profile. This changes request sizing only; provider URL/credential ownership, two-request concurrency, timeout, JSON normalization and evidence checks remain unchanged.
- HEART portal reordering does not create a new writer. Existing `requireWritableArchiveAction`, read-only snapshot behavior and HEART normalization are reused.
- Focused regression covers removed-provider identifier absence, TT default/fullscreen behavior, HEART-before-achievements ordering, user 60k max forwarding despite a 3.8k legacy hint, syntax, manifest and package integrity.

Targeted conclusion: no new Critical / High / Medium security issue identified in the r33 changes.


## r34 future-daily seasonal Drama / avatar-only dialogue targeted diff review

Scope: r33 `clean-tt` -> r34 `future-daily-drama`. Runtime changes are limited to HEART seasonal prompt inputs/generation gating, internal seasonal batch pairing and HEART presentation.

- The prior seasonal path treated each season as an incremental archive consumer: it supplied `incrementalArchiveSlice(...)`, required fresh Mxxx IDs before every new story, and instructed the model to let those IDs trigger the next plot. This made incidental archive details eligible to recur across every seasonal story. r34 removes that path from `generateHeartSeasonSection` and supplies seasonal prompts only a bounded `relationshipState`; raw memory rows, source anchors and relationship-summary prose are not seasonal plot inputs.
- Seasonal output remains normalized plain-text Voice/Scenario data. A new episode can be generated without archive growth because it is explicitly future/non-canonical simulation. Existing `normalizeHeart`, current-chat/origin/archiveRevision checks, deferred-patch handling and `saveSession` boundaries are unchanged, and seasonal output still cannot enter `MEMORY_KEY`.
- Partial Voice/Scenario retry now uses a code-generated internal batch ID. The season comes from the existing five-value allowlist; a pending internal batch can be resumed, but model output cannot choose the batch ID, season, patch destination, chat or revision.
- Prompt review explicitly prevents archive-specific objects, trauma/intimate details or evidence anchors from being recycled into seasonal plots and asks scene variety to come from ordinary future life. Named friends/family/colleagues may be used only when already present in the controlled character/world context; otherwise the prompt directs the model not to invent stable named relationships.
- The HEART page no longer renders the greetings tab or avatar-talk button. Existing greeting storage/normalization and archive-avatar popup selection remain escaped and read-only aware. This reduces presentation surface and does not add a new event, DOM sink, fetch/XHR, Slash Command, dynamic code execution, provider endpoint, credential access, world-info write, host-chat navigation or formal-memory write.
- Focused verification covers 45 Node regressions, including no seasonal `incrementalArchiveMemoryIds`/`sourceMemoryIds` dependency, relationship-only prompt context, pending half-pair continuation, absence of the greetings tab in `renderHeart`, avatar dialogue selection preservation, user max-output forwarding and all prior r33 safety/regression checks. Syntax, manifest parsing and package integrity also pass.

Targeted diff conclusion: no new Critical / High / Medium security issue identified. Residual model-quality uncertainty remains: worldbook/card content can influence supporting-cast choice as intended, but actual narrative variety depends on the selected model.


## r35 modular runtime / ADV EVENT targeted architecture review

Scope: local r34 `future-daily-drama` package -> local r35 `modular-runtime`. The change is primarily code movement plus the user-facing `ADV EVENT` rename; archive/cache schemas intentionally remain unchanged.

- The former `src/heartbeatMemories.js` was 791,231 bytes and owned every trust boundary and feature in one lexical scope. r35 splits runtime code into core, archive, generation, modes and UI modules; the entrypoint now exports only `initMemoryTheater` / `destroyMemoryTheater`.
- Mutable runtime state is centralized in `core/state.js`. Evidence validation, provider permits/timeouts, cache/revision persistence and writable-archive gating each retain one authoritative function definition. New architecture regressions assert those single-owner boundaries.
- During static `checkJs` review, the first mechanical split exposed a real shadowing hazard: importing the shared object as `state` could collide with existing local variables named `state` and redirect `state.activeMode`-style accesses into a local object/TDZ. The final build aliases the shared object as `runtimeState` everywhere and adds a regression that forbids the ambiguous import/reference form.
- Direct mode-to-mode imports were challenged after the mechanical split. Initial cross-links (`ENDING -> ROOM`, `HEART -> ENDING`, `ROOM -> PHONE`) were removed by relocating shared predicates/evidence helpers/draft access to common boundaries. The final `modes/*.js` set has no sibling-mode imports.
- `ADV EVENT` changes only product/display/module naming. The persisted mode value remains `MODE.ADV = "adv"`, so r34 and older cached `cache.adv` objects are addressed through the same key without migration or fallback guessing.
- Source-wide sink review found no new `eval`, `Function`, XMLHttpRequest, provider endpoint, credential/API-key read, world-info write or `MEMORY_KEY` write introduced by the split. Existing DOM insertion code was moved rather than expanded; generated strings remain under the same escaping/normalization functions.
- The split does not change r34 seasonal Drama semantics, 60k user max-output forwarding, TT display toggle, cache-idle persistence, Image Generation command restrictions, origin/revision fences or read-only historical snapshots.
- Focused verification: all JS files pass `node --check`; the ESM entrypoint imports successfully; manifest parses; the adapted r34 suite plus architecture checks passes 48/48. Additional checks verify no mode sibling imports, a thin entrypoint, one authoritative definition for evidence/request/cache/writeability boundaries, and legacy `adv` storage compatibility.

Targeted conclusion: no new Critical / High / Medium security issue identified in the r35 structural change. Main residual risk is architectural rather than exploitability: several UI/controller modules still participate in circular ESM import graphs inherited from the monolith. Module evaluation succeeds and no top-level business action is invoked during the cycle, but future refactors should progressively move controller orchestration upward to reduce cycles rather than reintroducing mode-to-mode state access.


## r35.1 startup-contract hotfix targeted diff review

Scope: r35 modular runtime -> r35.1 startup hotfix. Runtime source change is limited to `index.js`: restore the long-standing DOM-ready call to `initMemoryTheater()` because the manifest declares no init hook. `manifest.json` changes only the cache-busting build query/description. No mode, archive, cache, evidence, provider, rendering, URL, credential, command, or persisted-data code changed.

The regression was caused by replacing r34's self-starting entrypoint with an exported `init()` that SillyTavern did not invoke under the existing manifest. The hotfix restores the previous execution point without introducing model-controlled data, network authority, dynamic execution, or a new write path. Initialization remains inside `initMemoryTheater()` and its existing internal try/catch; disable/clean still call `destroyMemoryTheater()`. A new regression test requires the DOM-ready startup call and forbids returning to an unreferenced exported `init()` under this manifest.

Focused verification: syntax check for every runtime module, manifest JSON parse, complete Node regression suite (50/50), ZIP CRC, and local diff whitespace check. Targeted conclusion: no new Critical / High / Medium security issue identified.


## r36 relationship calendar targeted diff review

Scope: local r35.1 startup-hotfix package -> local r36 relationship-calendar. Runtime changes add one standalone Calendar mode/view, portal wiring, a calendar prompt/normalizer, calendar-specific bounded World Info scan terms, and refresh support in the existing generic generation path. No canonical archive schema migration is performed.

- `past` rows are derived locally from dated canonical Mxxx records in `modes/calendar.js`; the Calendar prompt explicitly excludes past output. Therefore provider text cannot manufacture a past event through this mode.
- `promised` rows remain untrusted until `core/evidence.js` validates the returned memory ID + anchor against the current archive. Invalid or invented IDs are discarded. A missing date may remain `待定`, but missing evidence cannot be downgraded into an accepted promise.
- `future` rows deliberately do not use archive evidence because they are not facts. They are accepted only with an explicit valid date and are tagged `world-setting`; UI copy identifies them as setting-only and not already happened/promised. The remaining uncertainty is model factuality when summarizing character/persona/world-info content, so these rows are intentionally non-canonical and never promoted into `MEMORY_KEY`.
- Calendar-specific `worldInfoScanTerms` extend only the already-bounded `buildControlledContextEnvelope` dry-run query. Default behavior for other modes is unchanged. The extra terms do not create a new network endpoint, credential source, World Info writer, or authority path.
- Calendar refresh uses the existing Connection Manager request coordinator, timeout/error policy, task-origin capture and derived-cache `saveSession` chat/revision fence. Calendar does not directly import sibling business modes.
- Calendar UI inserts generated/setting text only through the shared escaping helper. It exposes status/month filters and refresh only; no CG/ADV, future-special, URL, command or navigation action is introduced. The source-wide `innerHTML` assignment count increases from 36 to 37 solely for this new escaped calendar renderer.
- Targeted sink comparison (r35.1 → r36) keeps `fetch` at 5, XMLHttpRequest at 0, `eval` at 0, `new Function` at 0, Connection Manager `sendRequest` at 1, Slash-command references at 3 and canonical `MEMORY_KEY` writes at 1. No new credential/API-key access, arbitrary provider endpoint or World Info write was introduced.

Focused verification covers explicit date parsing, deterministic past projection, rejection of hallucinated promise evidence, separation of future setting rows, prompt trust-class rules, Calendar portal ordering, absence of story-generation actions, all prior r35.1 regressions, per-file syntax, ESM import, manifest parse and ZIP integrity.

Targeted diff conclusion: no newly introduced Critical / High / Medium security issue identified. Residual limitation: a model can mis-summarize an explicit setting date into a `future` row; that row remains visibly non-canonical, evidence-free and isolated from the formal archive by design.


## r36.1 stable identity targeted review

Only release identity metadata and entry cache-buster changed: display name remains fixed to `心跳回忆`, version metadata moves to `0.8.11`, homePage is the existing GitHub repository, and auto-update is enabled. No archive, prompt, network request, credential, DOM sink, execution, or evidence/revision boundary changed. No new Critical / High / Medium issue identified.


## r37 content controls targeted diff review

Scope: r36.1 stable-identity -> r37 content-controls. The change adds a derived-content manager, an allowlisted targeted-regeneration layer, derived-cache deletion helpers, double-confirmation UX, and replacement-mode support in the existing generator.

- Destructive scope remains derived data: `deleteSessions()` removes only selected keys from the existing theater cache and never references `MEMORY_KEY`. Existing full archive deletion remains a separate workflow.
- Target IDs come from the currently normalized session plus a fixed target-type allowlist. Neither DOM dataset values nor model output are used as arbitrary property paths, cache keys, URLs, commands, or file paths.
- Individual replacement is generate-then-commit: the old normalized session remains authoritative while the candidate is produced. Commit requires current task origin, matching live chat, matching archive revision, and the existing `saveSession()` fence.
- Evidence-backed Album / ADV / Ending / Achievement replacements retain or revalidate their original memory evidence. HEART seasonal Drama continues to use relationship distance rather than raw archive plot material. Calendar future rows stay setting-only.
- Existing-image redraw and image-reference deletion now use the same two-confirmation rule for replacement/destructive operations. Initial drawing of a previously empty image slot retains the ordinary provider-cost confirmation rather than being mislabeled as regeneration.
- Room category deletion/replacement invalidates Items and Phone only after the Room operation, preventing deep-mode cache from being silently attached to a different room structure.
- No new network destination, credential source, arbitrary HTML/script execution, canonical archive writer, or cross-chat authority was introduced. Provider requests still flow through the existing Connection Manager coordinator and concurrency cap.

Targeted diff conclusion: no newly introduced Critical / High / Medium security issue identified. Residual UX limitation: category-level regeneration rebuilds the category's base generated structure; optional nested artifacts such as already-rendered real images remain independently managed rather than being automatically re-billed/regenerated as part of the category operation.


## r38 calendar / phone regression-fix targeted review

Scope: local r37 content-controls package -> r38 calendar-phone fixes. Runtime changes are limited to the extension boot contract, Phone chat normalization/prompt validation, Phone UI rendering, and the topbar increment visibility rule. No canonical archive schema change is introduced.

- Calendar visibility: r35 modularization left child ES-module URLs stable across in-place updates. A browser module map can therefore retain an older `core/constants.js` / `archive/snapshots.js` while a newer `index.js` is loaded. r38 removes the static runtime import from `index.js`; a release build token in localStorage triggers one page reload when the build changes, then the runtime is dynamically imported with the current build query. The reload itself performs no archive/cache write and prevents mixed-version execution rather than expanding authority.
- Phone increment: the existing `generatePhoneIncrementalWithRepair()` path already used incremental Mxxx coverage and the shared request/chat/revision fences. r38 changes only `renderActive()` visibility so Phone, unlike other Room deep modes, exposes the existing topbar increment action. Items remains hidden because it depends on a selected searchable room object.
- Phone speakers: new chat output may carry `contactName` and `speakerRole=owner|contact`. These fields are normalized to bounded strings and never used as property paths, cache keys, URLs, commands, profile IDs, evidence IDs, or authorization state. A generated chat with messages must contain both owner and contact roles; generic single-sided `对方` output is rejected by the existing segment validation/retry path.
- Phone UI: owner/contact classes only affect presentation. Speaker names, times and message text still pass through the shared HTML escaping helper before `innerHTML`. Legacy cached chats without reliable roles are not silently rewritten; the UI shows an escaped static repair notice and lets the user use the existing double-confirmed single-entry regeneration flow.
- Capability comparison: no new `fetch`, XMLHttpRequest, `eval`, `new Function`, Slash Command, Connection Manager sendRequest, credential/secret read, `MEMORY_KEY` writer, World Info writer, arbitrary navigation, or model-controlled URL is introduced by this diff.
- Existing write isolation remains: Phone incremental and regenerated entries still save through the shared theater-cache `saveSession()` path after chatId/archiveRevision validation. Calendar remains a derived mode and does not write the canonical archive.

Targeted conclusion: no new Critical / High / Medium security issue identified in the r37 -> r38 diff. Residual compatibility note: the one-time release reload is intentionally a UI/runtime freshness measure; an environment that blocks localStorage simply falls back to ordinary module loading and may still require the user to manually refresh after updating.

## 0.8.14 calendar-visible-r38.1 targeted diff review

Scope: r38 -> r38.1 calendar discoverability-only UI change.

- Calendar remains the same `MODE.CALENDAR` derived-cache object with the same evidence, archive revision and Connection Manager boundaries.
- The generic portal grid no longer repeats Calendar; current and indexed archive views render a dedicated first-screen Calendar shortcut using fixed code-owned mode/action values.
- New shortcut text is fixed or escaped; no new URL, network, command, dynamic execution, MEMORY_KEY write/delete, or arbitrary cache-key authority was added.
- Capability count comparison is unchanged for fetch, innerHTML, Connection Manager sendRequest, slash-command execution, MEMORY_KEY references, eval and Function construction.
- Existing read-only snapshot behavior remains: a missing Calendar cannot be generated while read-only; a generated Calendar can be opened.
- Focused regression suite: 62/62 passed after the release-identity update.

Result: no new Critical/High/Medium issue identified in this targeted diff review.

## 0.8.18 r40.1 Calendar To-Do targeted diff review

Scope: local r40 personal-calendar candidate -> r40.1 Calendar To-Do. The change removes generated reflection prose from Calendar entries and replaces the clicked-date detail with code-owned completion state plus allowlisted semantic tags. No new provider endpoint, archive writer, navigation target, command surface, or execution primitive is introduced.

- `past` and `promised` evidence/date gates are unchanged: past dates still come from the exact cited dated Mxxx anchor, and a concrete promised date must still occur in cited archive evidence.
- Calendar tags are filtered through a fixed ten-value allowlist and capped at three. Unknown strings are discarded; UI output remains escaped even after allowlisting.
- Past completion (`✓`), promised pending (`□`) and future reminder (`◌`) states are computed locally from the normalized status. Model output cannot mark a promise completed or turn a setting reminder into an occurred event.
- Individual Calendar regeneration now requests only title + tags and still preserves the original date/status/evidence fields by merging onto the current normalized item after validation.
- `CALENDAR_SESSION_VERSION` moves from 2 to 3 only to invalidate the previous reflection-shaped derived Calendar session. It does not modify or delete `MEMORY_KEY` / Mxxx archive data.
- Targeted sink comparison r40 -> r40.1: `fetch(` 5 -> 5, `innerHTML` assignments 38 -> 38, Connection Manager `.sendRequest(` 1 -> 1, Slash-command references 3 -> 3, `MEMORY_KEY` references 10 -> 10, and `eval` / `new Function` / `XMLHttpRequest` remain 0.

Focused regression suite: 64/64 passes after rebuilding the 42-module single runtime bundle. No new Critical / High / Medium security issue identified.

## r40.3 targeted review — single calendar authority

- Private-terminal `schedule` / `calendar` apps are removed from new generation and filtered from legacy runtime sessions; relationship dates and promises remain owned by the standalone Calendar mode.
- The migration is derived-cache-only. It does not write, delete, or reinterpret `MEMORY_KEY` archive evidence.
- No new network, command execution, dynamic-code, or DOM sink was introduced. The r40.2 → r40.3 sink counts remain unchanged (`fetch` 5, Connection Manager `sendRequest` 1, `innerHTML` 38, `MEMORY_KEY` references 10, `eval`/`new Function`/XHR 0).
- Legacy Phone calendar removal happens on a structured clone before rendering. Other Phone apps and entries are preserved; if the removed app was selected, selection safely falls back to the first remaining app.
- Targeted conclusion: no new Critical / High / Medium security issue identified.

## 0.8.21 / r41 targeted diff review

Scope: r40.3 -> r41 HEART firefly habitat and paged seasonal Drama.

- No new `fetch`, Connection Manager `sendRequest`, slash-command execution, `MEMORY_KEY` authority, WebSocket/XHR, `eval`, or `new Function` capability was introduced.
- Firefly model strings are normalized and rendered through HTML escaping. Color is allowlisted; glow geometry is locally derived numeric style only.
- Seasonal `visualTone` is allowlisted before becoming a CSS class. The model cannot emit arbitrary CSS or class names into the seasonal stage.
- Firefly content remains noncanonical derived HEART state. Granular deletion/regeneration reuses the existing double-confirmation manager and does not mutate archive memories.
- Targeted review found no newly introduced Critical, High, or Medium severity issue.
- Worldline discoveries: r41.4 adds chat-scoped profile discoveries to the existing RELATIONS session. Each field is allowlisted, must cite a valid Mxxx ID + anchor, and its literal value must also be present in the cited memory title/summary/anchors. Discoveries are rendered separately and never promoted into the shared Character Profile, preventing one chat window from contaminating another.
## 0.8.28 / r41.7 Firefly dialogue + Drama pager targeted diff review

Scope: local r41.6真机故障修复候选 -> r41.7 HEART firefly-dialogue and Drama pager fix.

- Drama selection is now represented by a local `selectedDramaKey` pointing only to normalized Voice/Scenario items already present in the current HEART session. Legacy `selectedVoiceId` / `selectedScenarioId` remain read-only compatibility fallbacks. The new key grants no cache, archive, URL, object-path or write authority.
- New firefly output changes from one short `line` to bounded structured `title + thoughts[2..4]`; the compatibility `line` is derived from those paragraphs. Every model string remains normalized and HTML-escaped before rendering. No arbitrary HTML, CSS, class, URL or coordinates are accepted.
- New generation is bounded to 18–22 initial topics and 8–12 incremental topics. Incremental prompts carry at most 80 compressed existing-topic excerpts for duplicate avoidance, so the permanent firefly library cannot make request size grow without bound. Runtime rendering still caps the animated page at 18 nodes.
- Legacy one-line fireflies may be upgraded only after an explicit user action. The upgrade validator requires an exact existing id and unchanged allowlisted color; commit preserves source-memory IDs, archive/batch provenance and original generation metadata. It changes only derived HEART text and does not write `MEMORY_KEY`, renumber Mxxx records, or consume the incremental archive-coverage cursor.
- No new global `fetch` wrapper, network destination, credential reader, `eval`, `new Function`, `MutationObserver`, `requestAnimationFrame`, WebSocket/XHR or recurring timer was introduced.
- Focused regressions cover authoritative Scenario selection when a stale Voice ID exists, rich firefly validation, legacy one-line compatibility, exact id/color preservation during upgrade, provenance preservation, 8-item incremental minimum, and the existing 18-node page/performance guards.

Verification: 91/91 tests pass after rebuilding the single runtime bundle. Final source/bundle syntax and ZIP integrity are rechecked at packaging time. Targeted diff conclusion: no newly introduced Critical / High / Medium security issue identified.



## 0.8.29 / r41.8 Firefly small-batch targeted diff review

Scope: local r41.7 candidate -> r41.8 firefly batch/page-size reduction only.

- Preserves r41.5/r41.6 startup and ordinary-chat performance closures.
- Firefly generation and legacy-upgrade batches are bounded to 5-6 / 6 items respectively; page DOM is bounded to 6 glow nodes.
- No new network target, timer, requestAnimationFrame, MutationObserver, model-controlled CSS/URL/coordinates, or write authority was introduced.
- Existing firefly IDs, colors, provenance and Mxxx coverage boundaries remain unchanged.


## 0.8.30 / r41.9 Character Profile read/fold + single-garden targeted diff review

Scope: r41.8 -> r41.9 Character Profile literal fallback, collapsible overview, and duplicate base-only Relation Garden removal.

- Objective Profile fallback reads only the safely matched target character card's bounded identity/setup fields. It does not inspect chat messages, other characters, arbitrary files, external URLs, or Mxxx. First/example messages are intentionally excluded from the deterministic extractor.
- Fact label aliases normalize only into the existing fixed allowlist. `user_persona` is rejected as an objective `{{char}}` fact source; Persona remains accepted for explicit pre-story `{{user}}` relationship evidence. Literal extraction adds no inference authority and never converts vague prose into invented numerical facts.
- Existing Profile auto-patching runs only when opening one character archive page and only after existing name/avatar-safe character resolution. It updates Heartbeat's shared Profile settings only; it does not touch SillyTavern chat bodies or canonical `MEMORY_KEY`.
- The role overview's base-only garden is removed. Shared relationships are still retained as separate role-level data and merged only for rendering inside the single chat-scoped Relation Garden. Chat/worldline relationship evidence and cache ownership are unchanged.
- Collapsing Profile uses native code-owned `<details>` markup. No new model-controlled HTML/CSS/URL/coordinate/event sink is introduced.
- No new global `fetch` wrapper, network target, `eval`, `new Function`, `MutationObserver`, `requestAnimationFrame`, recurring timer, chat deletion API or arbitrary settings key is introduced.

Targeted conclusion: no newly introduced Critical / High / Medium security issue identified. Focused regression results and bundle/ZIP integrity are recorded at packaging time.

## 0.8.31 / r42.0 lazy bootstrap + zero-decompression diagnostic targeted diff review

Scope: local r41.9 candidate -> r42.0 startup/runtime delivery and diagnostic changes.

- Ordinary DOM-ready startup no longer imports or initializes the full runtime. Bootstrap only mounts fixed local entry UI and bounded mobile-safe gesture/mount handlers; it does not bind chat events, scan chat text, hydrate/compress cache, enumerate Connection Manager profiles, scan World Info, or call a provider.
- The runtime import remains a code-owned relative `./dist/heartbeatMemories.bundle.js?heartbeat=${BUILD}` path. No untrusted value controls the module path or origin.
- Runtime handoff removes the bootstrap shells before `initMemoryTheater()` and exposes only a narrow `openArchiveLibrary()` UI entry; existing archive write/delete authority is unchanged.
- Diagnostic reads compressed cache `data.length`, `sourceChars`, `modes`, Mxxx array length and chat array length only. It does not decode/decompress the cache, stringify large metadata, traverse message bodies, or write/save anything. Legacy raw cache size is deliberately left unmeasured.
- Diagnostic output uses `textContent`; the bootstrap `innerHTML` strings are fixed code-owned markup with no model/chat/world-book interpolation.
- No new global fetch wrapper, arbitrary network target, eval/new Function, WebSocket/XHR, MutationObserver, requestAnimationFrame, chat deletion API, or model-controlled HTML/CSS/URL/coordinate authority was introduced.
- Focused regression suite: 96/96 passes after rebuilding the 43-module runtime bundle.

Targeted conclusion: no newly introduced Critical / High / Medium security issue identified.

## 0.8.36 / r42.5 archive-durability targeted fix review

Scope: r42.4 -> r42.5 independent archive persistence, raw-cache cap enforcement, canonical archive compare-and-set, source-loss recovery, explicit deletion semantics and focused regressions. GitHub was used read-only; no repository write or hosted security scan was performed for this targeted remediation.

- The new IndexedDB store is reachable only from the full runtime module graph. `index.js` remains a lightweight bootstrap and its performance diagnostic does not import the bundle, open IndexedDB, decode/decompress cache data, traverse chat text or perform a backup scan.
- Backup records are code-owned structured clones bound to a local archive entry identity, character identity, chat ID and exact `archiveRevision`. Formal memory and raw cache JSON are capped at 12 MB UTF-8 bytes; compressed records retain the existing Base64 and source-byte limits. No HTML, URL, executable code, provider credential or chat message body is introduced into the backup format.
- `saveImportedMemory()` now requires explicit previous-presence/revision state and performs compare-and-set before staging, after cache preparation, after the awaited backup transaction and immediately before live metadata mutation. Foreground and deferred archive results share this boundary, so an old same-chat result cannot overwrite a newer revision.
- Source-chat fetch remains fixed same-origin `/api/chats/get`. Only a source failure enables the backup fallback; identity/schema/revision validation is fail-closed. A recovered backup is permanently read-only and cannot gain write authority or be rebound to another current chat.
- Raw legacy metadata is detached before runtime mutation, and every raw sink—including destroy fallback—uses the UTF-8 cap. An oversized or unserializable candidate leaves the previous durable value intact.
- Explicit current/archive-character deletion removes matching local backup content after the existing confirmations and atomically leaves a content-free per-entry deletion fence. Ordinary seed/cache transactions reject that fence, including writers that began before deletion but acquire the store transaction afterward; only a later explicit canonical first-create may replace it. Index-only removal preserves both source content and backup. No SillyTavern chat-delete/clear API is added.

The independent post-patch review initially identified one Medium deletion-vs-late-writer race, then found a legacy-entry-ID alias of that race during follow-up. The deletion fence is therefore enforced across every matching `chatId + character identity` alias in one IndexedDB transaction, and the seed path revalidates the live archive after asynchronous cache preparation. Focused interleaving regressions cover delayed seed, delayed derived-cache persistence and a legacy ID changing to a newly computed ID. The reviewer confirmed the Medium closed; no Critical / High / Medium security finding remains in this remediation scope.

Release verification: 118/118 tests passed; all source, test, tool, entrypoint and generated-bundle JS/MJS syntax checks passed. Two consecutive 44-module builds were byte-identical. Source fingerprint: `ba1ddd8fb288c7c230f7bcaa8037aa92e5f63632dfda425f1df9124f90a67183`; generated bundle SHA-256: `a4a2a819e4ac4b8712e91c4ba4da7ef7edf727fb50e1fbb77957d95539e341d4`. The CSS geometry benchmark passed at 320/375/390/430/768 px; a real Chromium screenshot run was unavailable in this environment because the browser executable was not installed. ZIP CRC and release SHA-256 are reported alongside the packaged artifact.

## 0.8.34 / r42.3 targeted remediation review

Scope: r42.2 -> r42.3 EverMind transport, cache byte budget, runtime lifecycle cleanup and single-history-chat loading only.

- EverMind rejects non-loopback HTTP before creating the transient Authorization header or calling SillyTavern `/proxy`; normal HTTPS and strict local loopback development remain available.
- Cache compression input and streamed decompression output now share one 12 MB UTF-8 byte limit. `sourceBytes` is recorded once during explicit compression and read by the lightweight diagnostic without encoding, decoding, decompression or cache serialization.
- Runtime destruction advances a lifecycle epoch before clearing transient state. Async preflight, archive overview/snapshot, model-list, gzip persist and gunzip hydrate writers compare the captured epoch before cache/UI/metadata writeback; generation origins carry the same epoch so stale deferred commits are rejected after disable/clean. Hydration Promise cleanup is identity-guarded so an old `finally` cannot delete a new-lifecycle task for the same scope.
- Opening one indexed historical archive uses a fixed same-origin `/api/chats/get` request for that indexed chat ID and discards returned message rows after reading the header metadata. The explicit legacy discovery scan retains `metadata:true` because it must discover archives across all files.
- The lazy bootstrap import path, deletion authority, archive evidence rules, incremental content and ordinary chat event paths are unchanged.

Targeted conclusion: the reported remote plaintext credential path is closed; no new Critical / High / Medium issue was identified in this remediation scope.

## 0.8.35 / r42.4 diagnostic-toggle targeted diff review

Scope: r42.3 -> r42.4 lightweight bootstrap and full settings diagnostic visibility controls, release metadata, tests and generated runtime bundle only.

- Both settings surfaces now use an explicit code-owned close control and a reversible trigger state. The controls update only local `hidden`, `aria-expanded` and fixed label text.
- Diagnostic report content continues to be assigned with `textContent`; this change adds no HTML interpretation, model-controlled URL/CSS, network target, credential path, storage mutation or deletion authority.
- The lightweight close/open branches do not call `ensureRuntime()` or dynamic import. The existing diagnostic implementation remains O(1), zero-decompression and observational.

Targeted conclusion: no newly introduced Critical / High / Medium security issue identified.
