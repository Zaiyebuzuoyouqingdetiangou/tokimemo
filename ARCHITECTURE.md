# Heartbeat Memories r35 Architecture

r35 is a zero-schema modularization of the r34 runtime. The persisted archive and derived-cache contracts are intentionally unchanged.

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
             ↓
 archive / evidence
 generation
 requestCoordinator
 cache / revision fence
```

`MODE.ADV` deliberately remains the persisted value `adv`. `ADV EVENT` is the product/module/UI name only until a future explicit schema-migration release.

## SillyTavern entrypoint contract

`manifest.json` currently declares only the `disable` and `clean` hooks. Therefore `index.js` must keep the DOM-ready self-start path (`jQuery(() => initMemoryTheater())`). Merely exporting an `init()` function is not sufficient for this manifest and leaves an enabled extension unmounted. Any future switch to a host-managed init hook must change the manifest and entrypoint together and retain a regression test for startup.
