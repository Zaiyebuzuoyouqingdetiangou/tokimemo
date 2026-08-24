# Heartbeat Memories r35–r36 Architecture

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

`manifest.json` currently declares only the `disable` and `clean` hooks. Therefore `index.js` must keep the DOM-ready self-start path (`jQuery(() => initMemoryTheater())`). Merely exporting an `init()` function is not sufficient for this manifest and leaves an enabled extension unmounted. Any future switch to a host-managed init hook must change the manifest and entrypoint together and retain a regression test for startup.


## r36 Calendar boundary

Calendar is a standalone business mode (`MODE.CALENDAR = "calendar"`) and follows the same no-sibling-mode-import rule. It does not modify `MEMORY_KEY`. Its three classes intentionally carry different trust semantics:

- `past`: deterministic local projection of dated canonical archive memories. The model is never allowed to author this class.
- `promised`: model extraction is accepted only after the shared evidence boundary validates a real memory ID and anchor from the current archive.
- `future`: non-canonical setting reference derived from bounded character/persona/world-info context; it carries no archive evidence and the UI explicitly labels it as setting-only.

Calendar refreshes use the existing Connection Manager request coordinator and save through the same chatId/archiveRevision-bound derived-cache path. Calendar-specific World Info scan terms only broaden which already-configured setting entries may be included in the bounded context; they do not create archive facts, bypass evidence, or write World Info.
