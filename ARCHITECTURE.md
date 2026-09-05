# Heartbeat Memories r35–r49 Architecture

r35 is a zero-schema modularization of the r34 runtime. r36 adds Calendar as the first post-modularization feature without changing the canonical archive schema. The persisted archive and derived-cache contracts remain compatible.

## r49.0 deep-review and ArchiveTarget contract

- Live archive creation and incremental archive updates remain current-chat operations. Only derived generation for an already saved archive can create an `ArchiveTarget` from an explicit archive-library selection.
- An ArchiveTarget freezes character/chat identity, archive revision, cache write fence, deletion state and a bounded A-only context envelope before the provider request. Completion reloads A and uses compare-and-swap; navigation to B never relaxes A's revision, lifecycle, supersede or delete checks.
- Derived persistence is one ordered copy-on-write chain: normalized in-memory result, compressed metadata candidate, origin-bound local backup, metadata commit and bounded deferred recovery. Every asynchronous boundary rechecks origin and lifecycle. Ordinary bootstrap and message events still avoid IndexedDB, decompression, archive scans and provider work.
- Connection Profile and manual transport have independent fingerprints, request epochs, model caches and saved-model fallback. Neither path changes the main-chat profile. Provider bodies and credentials are outside the user-visible error contract.
- Registered third-party memory adapters require a documented public read-only API. r49 removes the old EverMind private-settings/API-key reader and every heuristic reader based on global method names or ambient prompt/metadata labels from production discovery and fetch paths; existing Heartbeat ledger rows remain independent data and explicit inert file import remains available. Coverage contradictions fail closed to partial, and provider traversal cannot exceed the ledger character budget.
- `core/worldPresentation.js` is the single presentation-only authority for room, travel, private terminal and calendar visual choices. It accepts explicit controlled setting evidence, identity-bound/exact-revalidated Character Profile facts, or two non-overlapping real-chat archive clusters in that order. It cannot create relationship/history/NPC facts. Media frames and negated world states are distinct scopes; insufficient or conflicting evidence returns neutral.
- Model output remains bounded structured data. All HTML, SVG geometry, CSS classes, URLs, storage keys, target identity and write paths are code-owned. Renderer sinks revalidate cached Travel/Calendar class enums instead of assuming a current-version cache already passed normalization. Calendar and Travel migrations preserve earlier sessions; formal archive and cache metadata keys remain V3 for backward compatibility while BUILD provides the r49 runtime cache bust.

```text
src/
├─ heartbeatMemories.js        init / destroy only
├─ core/
│  ├─ constants.js             stable IDs, limits, MODE values
│  ├─ state.js                 mutable runtime state
│  ├─ settings.js              extension / Connection Manager settings
│  ├─ independentApi.js        Profile capability gate + same-origin manual transport
│  ├─ context.js               live chat / origin identity
│  ├─ requestCoordinator.js    task keys, provider permits, timeout
│  ├─ deferredCommitStore.js   bounded local recovery queue for origin-bound results
│  ├─ cache.js                 derived cache + revision-bound persistence
│  ├─ evidence.js              memory ID + anchor validation
│  ├─ incremental.js           per-part coverage cursors
│  └─ text.js                  escaping / bounded text helpers
├─ archive/
│  ├─ repository.js            canonical archive and memory-source processing
│  ├─ backupStore.js            full-runtime-only browser-local IndexedDB backup
│  ├─ memoryProviders.js        versioned current-chat read-only adapters
│  ├─ memoryFileImport.js       inert JSON/JSONL/TXT/Markdown preview/import
│  ├─ sourceLedger.js            role/chat-bound IndexedDB source ledger
│  ├─ groups.js                character grouping/index metadata
│  ├─ snapshots.js             historical snapshot lookup
│  └─ library.js               archive-library behavior and writeability gate
├─ generation/
│  ├─ client.js                explicit Profile/manual JSON request dispatch
│  ├─ prompts.js               shared prompt helpers/registry glue
│  ├─ jsonParser.js            bounded JSON extraction
│  ├─ normalizers.js           mode normalization dispatch glue
│  └─ imageGeneration.js       SillyTavern Image Generation bridge
├─ modes/
│  ├─ album.js
│  ├─ advEvent.js              product name ADV EVENT, storage key still `adv`
│  ├─ room.js
│  ├─ items.js
│  ├─ phone.js
│  ├─ ending.js
│  ├─ calendar.js           relationship calendar; derived cache only
│  ├─ heart.js
│  ├─ achievements.js
│  └─ butterfly.js
└─ ui/
   ├─ overlay.js
   ├─ archivePortal.js
   ├─ settingsPanel.js
   ├─ albumView.js
   ├─ advEventView.js
   ├─ heartView.js
   ├─ phoneView.js
   ├─ endingView.js
   ├─ calendarView.js
   ├─ butterflyView.js
   └─ styles.js
```

## Dependency rule

Business modes must not directly import sibling business modes. Shared facts and authority go through the common boundaries:

```text
Album ───────┐
ADV EVENT ───┤
Phone ───────┤
HEART ───────┤
ENDING ──────┤
Calendar ────┤
             ↓
 archive / evidence
 generation
 requestCoordinator
 cache / revision fence
```

`MODE.ADV` deliberately remains the persisted value `adv`. `ADV EVENT` is the product/module/UI name only until a future explicit schema-migration release.

## SillyTavern entrypoint contract

`manifest.json` declares only the `disable` and `clean` hooks, so `index.js` still owns DOM-ready self-start. Since r42.0 that self-start is intentionally **bootstrap-only**: it mounts a tiny archive menu/settings placeholder plus the zero-decompression diagnostic, but it must not import the full runtime. The first explicit Heartbeat action calls `ensureRuntime()`, removes the bootstrap shells, dynamically imports the single versioned bundle, then runs `initMemoryTheater()`. Regression tests must keep the full bundle out of ordinary SillyTavern startup.


## r36-r40 Calendar boundary

Calendar is a standalone business mode (`MODE.CALENDAR = "calendar"`) and follows the same no-sibling-mode-import rule. It does not modify `MEMORY_KEY`. Its three classes intentionally carry different trust semantics:

- `past`: deterministic local projection of dated canonical archive memories. The model is never allowed to author this class.
- `promised`: model extraction is accepted only after the shared evidence boundary validates a real memory ID and anchor from the current archive.
- `future`: non-canonical setting reference derived from bounded character/persona/world-info context; it carries no archive evidence and the UI explicitly labels it as setting-only.

Calendar refreshes use the existing Connection Manager request coordinator and save through the same chatId/archiveRevision-bound derived-cache path. Calendar-specific World Info scan terms only broaden which already-configured setting entries may be included in the bounded context; they do not create archive facts, bypass evidence, or write World Info.

### r40 personal-calendar projection

Calendar is now a curated projection rather than a one-row-per-dated-memory projection. Model output can nominate `past` marks, but the normalizer only accepts a mark when its evidence anchor resolves to a dated canonical memory; that canonical memory supplies the visible date. `promised` rows retain evidence references and concrete dates are additionally checked against the cited evidence text.

r40.2 originally extended the derived Calendar session with root-level `stickyNotes` and `moodNotes`. Archive-backed sticky notes and all mood notes still pass the same memory ID + anchor evidence normalization; setting-backed sticky notes carry no memory IDs and remain explicitly non-canonical setting reminders.

### r43 Calendar v5 dated-page boundary

`CALENDAR_SESSION_VERSION=5` moves notebook content into `dayPages`, keyed only by code-normalized `date:YYYY/MM/DD`, `annual:MM/DD`, `pending:<entry-id>` or the single `legacy:unassigned` compatibility page. Each page owns its `drafts`, `stickyNotes`, `moodNotes` and `manualTodos`; entry-derived To-Do rows are selected only from that page's `entryIds`. Empty calendar cells may create an empty local page without a model request or archive mutation.

The v4 migration is deliberately non-fanout. A root-level note is assigned only when its explicit date, linked Calendar entry or validated archive evidence resolves one page. Anything ambiguous is preserved once in `legacy:unassigned`; it is never cloned across dates and no date is guessed. Calendar refresh merges existing page-owned user content back by exact page key, while the canonical `MEMORY_KEY` archive remains untouched.



## r37 Content control boundary

`ui/contentManager.js` only renders allowlisted targets from the already-normalized active session. `ui/overlay.js` owns destructive orchestration and the live writable-archive gate. Targeted model replacements are implemented in `generation/contentRegeneration.js`; model output never selects a cache key, mode, object path, or target ID. A replacement is committed only after current-chat and archive-revision checks pass.

Whole-category deletion uses the shared `core/cache.js::deleteSessions()` derived-cache boundary. It never writes or deletes the canonical `MEMORY_KEY`. Deleting/replacing Room invalidates Items and Phone because those modes depend on the room structure.


## r38 runtime freshness and Phone chat roles

`index.js` no longer statically imports the modular runtime. r38 temporarily used a one-time page reload to refresh a child-module graph; the current r39+ delivery removes that reload. On the user's first explicit Heartbeat action, the lightweight bootstrap dynamically imports the single generated `dist/heartbeatMemories.bundle.js?heartbeat=<BUILD>` artifact. The versioned one-file graph prevents a new entrypoint from mixing with stale child modules without adding a navigation side effect.

Phone/Terminal remains `MODE.PHONE` under Room, but its topbar increment action is now exposed because the mode already owns a safe incremental merge path. Chat entries may store `contactName`; messages may store `speakerRole` (`owner` or `contact`) in addition to the escaped display `speaker`. These are presentation fields only and do not change archive evidence or authority.

## r43 persona-surface architecture

Room and Phone consume bounded character-card, Persona and relevant World Info context, then normalize it into code-owned visual descriptors. Explicit World Info/card fields are separated from inferred fields; missing fields are deterministically completed from the controlled character identity instead of accepting a copied generic profile. Room scene palette/material/density and the CSS person's hair/garment/silhouette/accessory values are allowlisted tokens, while face proportions are bounded code-derived numbers. No archive/profile avatar is used inside the room scene, and no model string can become CSS, HTML, a URL or a coordinate. Room prose has a separate semantic authority: after a prose block mentions the user, each clause must independently match a bounded present-only form; a current-time token cannot authorize an adjacent or nested episode. Past/resultative claims require an exact archive reference whose anchor is visible in the narrative, and cached room beats are rechecked at presentation time. Positive controlled ownership evidence also creates a normalization invariant: at least one valid node for every evidenced pet species must survive, otherwise the candidate is retried. The same normalized cues keep the room and figure coherent while still allowing separate chat/worldline identities.

Phone remains a Room-owned derived mode, but its UI state is explicitly hierarchical: `home` shows the recognizable device and App icons, `app` shows one App's independent list, and `detail` shows one normalized entry. Device kind, theme, wallpaper treatment, icon style and App plan are persona-sensitive but reduce to fixed local enums and normalized structured data. View selection never grants a model-controlled cache key, object path, URL, device API or real-world messaging action.

Heartbeat theme state is normalized in `core/theme.js`. Default/custom/host modes all resolve to strict local hex tokens; host mode samples only standard `getComputedStyle(body)` foreground/background and never reads a theme extension's private state. Card alpha is emitted as a dedicated RGBA surface token and consumed only by card backgrounds. The main reading background and text remain opaque, with readable colours selected against both the solid surface and its known composite over the Heartbeat background. Final ID-scoped UI rules protect the overlay, cards, buttons and form controls from ordinary host CSS without flattening model-free specialist presentation inside each mode.

Butterfly r43 is a content-contract change only. `ui/butterflyView.js`, its divergence map, terminal palette, one-second SIGNAL transition and Ω placement remain the presentation contract. The mode prompt and normalizer require at least eight materially distinct ordinary simulations plus first-person monologue, current-world response, cold Chinese system assessment and one Ω/TRUE ENDING; local validation rejects undersized/duplicated content and banned third-party romance before derived-session commit. Simulations still do not become archive evidence.


## r39 runtime delivery

`src/` remains the authoritative modular source tree. Release builds additionally contain `dist/heartbeatMemories.bundle.js`, generated from the reachable module graph. Once Heartbeat is explicitly opened, SillyTavern loads only that one versioned bundle. This keeps source ownership boundaries reviewable while avoiding a deep multi-request ES-module waterfall on cloud-hosted installations. r42.0 further defers that one bundle until first use.


## r42.0 lazy-bootstrap / diagnostic contract

- Ordinary SillyTavern startup may parse only the small `index.js` bootstrap. It must not import `dist/heartbeatMemories.bundle.js` until the user explicitly opens the archive or requests the full settings UI.
- Bootstrap owns only fixed local menu/settings markup, a bounded mount retry, and two mobile-safe early gesture listeners. It must not bind chat events, scan `context.chat`, enumerate Connection Manager profiles, read World Info, hydrate/compress theater cache, or call providers.
- The bootstrap performance diagnostic reads only already-parsed metadata fields and string lengths. For compressed cache it may read `format/storageVersion/modes/sourceChars/sourceBytes/data.length`; it must never Base64-decode, decompress, encode/stringify the cache, or iterate chat message bodies. New cache writes use one 12 MB UTF-8 byte budget for both compression input and streamed decompression output.
- Runtime handoff removes bootstrap shells before `initMemoryTheater()` mounts the authoritative settings/menu. The runtime remains a single generated bundle and keeps the existing cleanup/security boundaries.

## r42.5 archive durability contract

- Canonical `MEMORY_KEY` remains the live-chat copy, but every explicit canonical commit first stores a bounded, identity-bound copy in `archive/backupStore.js`. That module is reachable only from the full runtime bundle; bootstrap startup and its zero-decompression diagnostic never import it or open IndexedDB.
- Canonical commits require an explicit previous state: either `{present:false}` for first creation or `{present:true, revision:<exact>}` for an update/rebuild. The same compare-and-set is rechecked after asynchronous backup persistence and before live metadata mutation.
- A source-chat read failure may fall back to the matching local backup only after entry ID, character identity, chat ID, schema and archive revision validation. Recovered snapshots are permanently read-only and cannot be rebound to another chat.
- Every raw derived-cache sink uses the same 12 MB UTF-8 byte cap. Runtime writers detach legacy raw metadata before mutation, and an oversized destroy-time candidate leaves the previous durable value untouched.
- The backup is browser-local durability, not cross-device sync: clearing site data or using another browser/device removes access to it. Explicit Heartbeat archive deletion replaces matching content with a tiny content-free deletion fence so delayed seed/cache transactions cannot recreate it; only a later explicit canonical first-create may clear that fence. Index-only removal does not delete the backup.

## r45.0 independent API transport contract

- `apiConnectionMode` selects exactly one transport. Legacy r44 settings migrate to `profile`; manual URL/Key/model stay in separate fields so switching views never conflates Profile credentials with a custom endpoint.
- `core/independentApi.js` owns the 1.1.18-labelled one-click capability gate, manual URL normalization, fixed same-origin `/status` and `/generate` calls, bounded response reading, visible-content extraction and credential-free errors.
- `generation/client.js` keeps the single provider permit/timeout/JSON-validation pipeline and dispatches through only the selected adapter. Profile requests use messages with preset/instruct disabled; manual requests never browser-fetch the third-party URL.
- Settings changes advance an API epoch, clear model caches and cancel live tasks. Each completed generation additionally compares a credential-redacted configuration fingerprint before parsing or saving.

## r48.0 calendar holiday-card contract

- Calendar v6 adds date-owned `holidayCards`; v5 `dayPages` migrate in place so drafts, manual To-Do compatibility data, sticky notes and mood notes are not rebuilt or fanned out.
- A card can reference only one normalized `future` entry explicitly typed `occasionType=holiday`. Birthday, anniversary and generic setting dates are ineligible.
- Card content is derived state for the selected archive snapshot. It never becomes Mxxx evidence and does not make past shared-holiday claims authoritative.
- The model returns a small allowlisted art-direction object. The renderer owns all HTML/CSS/SVG, uses deterministic local primitives, fixed palette/media/stroke enums and bounded numeric parameters, and escapes all visible model text.
- The renderer has no remote image/URL path and no model-provided SVG path, class name, selector, style text or event handler.
- Holiday UI remains date-scoped and quiet: one marker in the calendar cell and the card on the selected page; no tutorial block is added.

## r47.0 durability, presentation and theme contract

- Derived-session completion may explicitly flush the current archive cache, but only after the full runtime is already loaded and only while the captured chat/character/archive revision still matches. Backup writes remain before metadata commit; failed durable writes keep the bounded deferred result for retry.
- Full-runtime archive backup reconciliation can promote a newer same-revision derived cache from the independent local backup. It cannot cross chat/revision/deletion fences and is never executed by the lightweight startup path.
- World-aware travel/room/private-terminal presentation uses local allowlists and code-owned renderers. Model output remains structured text/enums and cannot choose executable markup, arbitrary classes, URLs, coordinates, cache keys or write targets.
- Theme settings map to Heartbeat semantic CSS variables. Host-follow mode reads only standard computed foreground/background styles; it does not inspect private theme settings or third-party beautification internals.
- Product UI copy should stay compact: no repeated gameplay/explanation blocks; preserve only necessary status, controls and destructive/safety confirmations.

## r46.0 universal memory and deferred-result durability contract

- Registered readers are explicit adapters. `STBaiBaiBook` is accepted only with numeric `apiVersion === 1`; `getHistory()` is preferred, `getInjectedHistory()` is a partial fallback, and history/snapshot must agree on current chat and revision. As of r49, the former EverMind private adapter and heuristic global-reader compatibility path are retired; unknown plugins use explicit inert file import instead.
- File import is a two-step, current-role/current-chat-bound operation: parse inert JSON/JSONL/TXT/Markdown into a visible preview, then require an explicit history/summary-not-character-setting confirmation and revalidate the binding. Unknown JSON string leaves are included with their data path unless they are recognized metadata; credential and connection-configuration fields are excluded and make coverage explicitly partial. Confirming one file does not authorize a third-party scan. Ordinary World Info remains setting context; only books explicitly marked as history summaries enter the source ledger as summary evidence.
- `archive/sourceLedger.js` stores the confirmed provider/file text, full-identity-derived provider key, stable source ID, revision, provider version and coverage in a separate IndexedDB ledger. Long provider/source/revision identities are compacted with a hash of the complete value rather than a truncated prefix. Mutations for one role/chat are serialized and multi-book changes commit as one write. Complete revisions replace their baseline; partial revisions overlay it. Per-book UID allowlists implement immediate explicit revocation, including while a replacement read is still pending, and legacy combined World Info records migrate to per-book baselines before the legacy stream is tombstoned. Prompt sampling is bounded independently from full stored source text. A failed/corrupt ledger read aborts update rather than being interpreted as an empty ledger, and writes/deletes wait for transaction completion.
- Archive creation first consumes an in-memory scan preview when present, otherwise it may load the already-confirmed bound ledger directly. This keeps prior sources usable after provider removal or page reload without granting a removed plugin new authority.
- Completed work that cannot yet target its origin chat is stored by `core/deferredCommitStore.js` in a credential-scrubbed localStorage queue bounded to 24 items, 3.5 MB and seven days. Role origin is rechecked after backup/cache awaits and inside final session/archive commits, not only before the operation starts. Runtime scopes, archive indexes, groups and backups include a character-slot hint so even identical cloned cards stay separate; same-avatar edit/rename recovery remains revision-gated. A completed backup can be retried idempotently after a temporary navigation race. ACK removes only the exact object that was flushed, so a newer same-millisecond result cannot be deleted with the old one. ACK otherwise occurs only after a successful write or a permanent origin/revision conflict; transient failures remain queued. Runtime destruction clears live tasks and ephemeral caches but preserves this durable queue.
- Travel postcard geometry remains code-owned. The model chooses only an allowlisted scene theme; SVG uses a fixed 2:1 viewBox with non-cropping layout, and legacy locations infer a safe theme from bounded text.

## r41.5 performance contract

- Runtime delivery remains one versioned `dist/heartbeatMemories.bundle.js`.
- Before r42 the runtime mounted the settings/menu shell with `ensureSettingsStyles()` only. Since r42 ordinary startup is even smaller: bootstrap CSS only; after first explicit Heartbeat use, runtime settings CSS is mounted and the full archive/theater stylesheet is still deferred to `openOverlay()`.
- Ordinary message events must use the lightweight settings-status path. They may clear tiny bookkeeping caches, but must not scan `context.chat`, hydrate/compress theater caches, scan World Info, rebuild Character Profile/relations, or call a provider.
- Deleted-character filtering builds one operation-local Set index and reuses it for all archive rows during library render / legacy scan.
- Firefly persistence is independent from active DOM size: the library may keep up to the normal derived-content cap, while one page renders at most 18 animated lights.
