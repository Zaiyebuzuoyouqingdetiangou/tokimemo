# Heartbeat Memories r35–r38 Architecture

r35 is a zero-schema modularization of the r34 runtime. r36 adds Calendar as the first post-modularization feature without changing the canonical archive schema. The persisted archive and derived-cache contracts remain compatible.

```text
src/
├─ heartbeatMemories.js        init / destroy only
├─ core/
│  ├─ constants.js             stable IDs, limits, MODE values
│  ├─ state.js                 mutable runtime state
│  ├─ settings.js              extension / Connection Manager settings
│  ├─ context.js               live chat / origin identity
│  ├─ requestCoordinator.js    task keys, provider permits, timeout
│  ├─ cache.js                 derived cache + revision-bound persistence
│  ├─ evidence.js              memory ID + anchor validation
│  ├─ incremental.js           per-part coverage cursors
│  └─ text.js                  escaping / bounded text helpers
├─ archive/
│  ├─ repository.js            canonical archive and memory-source processing
│  ├─ groups.js                character grouping/index metadata
│  ├─ snapshots.js             historical snapshot lookup
│  └─ library.js               archive-library behavior and writeability gate
├─ generation/
│  ├─ client.js                Connection Manager JSON requests
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

r40.2 extends the derived Calendar session with two notebook-only arrays: `stickyNotes` and `moodNotes`. Archive-backed sticky notes and all mood notes must pass the same memory ID + anchor evidence normalization; setting-backed sticky notes carry no memory IDs and remain explicitly non-canonical setting reminders. The global To-Do list is rendered from validated `promised` rows rather than a second model-owned task list. `CALENDAR_SESSION_VERSION=4` invalidates only stale derived Calendar sessions.



## r37 Content control boundary

`ui/contentManager.js` only renders allowlisted targets from the already-normalized active session. `ui/overlay.js` owns destructive orchestration and the live writable-archive gate. Targeted model replacements are implemented in `generation/contentRegeneration.js`; model output never selects a cache key, mode, object path, or target ID. A replacement is committed only after current-chat and archive-revision checks pass.

Whole-category deletion uses the shared `core/cache.js::deleteSessions()` derived-cache boundary. It never writes or deletes the canonical `MEMORY_KEY`. Deleting/replacing Room invalidates Items and Phone because those modes depend on the room structure.


## r38 runtime freshness and Phone chat roles

`index.js` no longer statically imports the modular runtime. A release `BUILD` token is stored outside the theater/archive data; when a new build is detected, the page reloads once and then dynamically imports `src/heartbeatMemories.js?heartbeat=<BUILD>`. This prevents an in-place SillyTavern update from combining a new entrypoint with stale child modules.

Phone/Terminal remains `MODE.PHONE` under Room, but its topbar increment action is now exposed because the mode already owns a safe incremental merge path. Chat entries may store `contactName`; messages may store `speakerRole` (`owner` or `contact`) in addition to the escaped display `speaker`. These are presentation fields only and do not change archive evidence or authority.


## r39 runtime delivery

`src/` remains the authoritative modular source tree. Release builds additionally contain `dist/heartbeatMemories.bundle.js`, generated from the reachable module graph. Once Heartbeat is explicitly opened, SillyTavern loads only that one versioned bundle. This keeps source ownership boundaries reviewable while avoiding a deep multi-request ES-module waterfall on cloud-hosted installations. r42.0 further defers that one bundle until first use.


## r42.0 lazy-bootstrap / diagnostic contract

- Ordinary SillyTavern startup may parse only the small `index.js` bootstrap. It must not import `dist/heartbeatMemories.bundle.js` until the user explicitly opens the archive or requests the full settings UI.
- Bootstrap owns only fixed local menu/settings markup, a bounded mount retry, and two mobile-safe early gesture listeners. It must not bind chat events, scan `context.chat`, enumerate Connection Manager profiles, read World Info, hydrate/compress theater cache, or call providers.
- The bootstrap performance diagnostic reads only already-parsed metadata fields and string lengths. For compressed cache it may read `format/storageVersion/modes/sourceChars/sourceBytes/data.length`; it must never Base64-decode, decompress, encode/stringify the cache, or iterate chat message bodies. New cache writes use one 12 MB UTF-8 byte budget for both compression input and streamed decompression output.
- Runtime handoff removes bootstrap shells before `initMemoryTheater()` mounts the authoritative settings/menu. The runtime remains a single generated bundle and keeps the existing cleanup/security boundaries.

## r41.5 performance contract

- Runtime delivery remains one versioned `dist/heartbeatMemories.bundle.js`.
- Before r42 the runtime mounted the settings/menu shell with `ensureSettingsStyles()` only. Since r42 ordinary startup is even smaller: bootstrap CSS only; after first explicit Heartbeat use, runtime settings CSS is mounted and the full archive/theater stylesheet is still deferred to `openOverlay()`.
- Ordinary message events must use the lightweight settings-status path. They may clear tiny bookkeeping caches, but must not scan `context.chat`, hydrate/compress theater caches, scan World Info, rebuild Character Profile/relations, or call a provider.
- Deleted-character filtering builds one operation-local Set index and reuses it for all archive rows during library render / legacy scan.
- Firefly persistence is independent from active DOM size: the library may keep up to the normal derived-content cap, while one page renders at most 18 animated lights.
