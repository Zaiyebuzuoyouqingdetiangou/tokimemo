# Runtime build and regression checks

Requires Python 3 and Node.js with `vm.SourceTextModule` support. No dependencies
are downloaded. Run from the repository root:

```sh
python3 tools/verification/build.py . --sync-release-notes
python3 tools/verification/build.py . --check
python3 tools/verification/run-tests.py
```

`--sync-release-notes` first regenerates `src/core/releaseNotes.js` from the
complete `README.md`. Without that option the builder reads source only. `--check`
is read-only. Use `--output /tmp/heartbeatMemories.bundle.js` to put the generated
bundle outside the repository. The build prints module count, source SHA-256,
and generated bundle SHA-256 as JSON.

The builder traverses static imports from `src/heartbeatMemories.js` and rebuilds
every module wrapper directly from source. It never reads an existing bundle
unless `--check` compares the finished output. Namespace imports, named imports,
and declaration exports match this repository's module format. Other import or
export forms fail explicitly.

`module-order.json` preserves the relative initializer order of all 362 modules
from main commit `412ca036cba2cca388a6b756c79b057416b6b361`, adding the new
`autoMemory/roundContext.js` before its consumers. That order is compatibility metadata,
not executable code copied from the bundle. Adding or removing a reachable module
fails the build until this order is reviewed; eager imports make silently
reordering initializers unsafe.

Recovery was verified against that unmodified main checkout by rebuilding the
entire runtime and comparing every byte:

- Source SHA-256: `078ebfccd72a641a7423fe723c81923c4bf216a29384c5209b0ce78b3887933d`
- Bundle SHA-256: `69373b2f9d8f8d57bff7ea74f83ffc498610d32e90f3f0c682358cbe7e549c00`

The source hash is SHA-256 over modules in sorted relative-path order, with each
record encoded as UTF-8 path, NUL, raw source bytes, NUL. Sources use LF newlines.

The build regression test checks full bundle reproducibility, JavaScript syntax
and runtime import linking, independent source-only fixture builds, changed-source
propagation, unsupported syntax and graph rejection, and complete release notes
embedding. To recheck a separate baseline without modifying it, provide that
baseline's matching initializer inventory:

```sh
RMT_BUILD_SOURCE_ROOT=/path/to/unmodified-baseline RMT_BUILD_MODULE_ORDER=/path/to/baseline-module-order.json node --experimental-vm-modules --test tests/healthcheck-build.mjs
```
