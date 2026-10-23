#!/usr/bin/env python3
"""Rebuild the runtime from src without reading or patching the existing bundle.

The checked-in module order preserves the historical initializer order. It is
intentionally explicit: changing it can change eager named-import bindings.
The supported module syntax is the namespace/named imports and declaration
exports used by this runtime; unsupported declarations fail the build.
"""

import argparse
import hashlib
import json
from pathlib import Path
import posixpath
import re
import sys


ENTRY = "heartbeatMemories.js"
DEFAULT_ORDER = Path(__file__).with_name("module-order.json")
IDENTIFIER = r"[A-Za-z_$][\w$]*"
NAMESPACE_IMPORT = re.compile(
    rf"^import\s+(\*\s+as\s+{IDENTIFIER})\s+from\s+(['\"])(.+?)\2\s*;\s*$",
    re.MULTILINE,
)
NAMED_IMPORT = re.compile(
    r"^import\s+(\{[^}]*\})\s+from\s+(['\"])(.+?)\2\s*;\s*$",
    re.MULTILINE,
)
EXPORT_PATTERNS = [
    re.compile(rf"^export async function ({IDENTIFIER})", re.MULTILINE),
    re.compile(rf"^export function ({IDENTIFIER})", re.MULTILINE),
    re.compile(rf"^export (?:const|let|var|class) ({IDENTIFIER})", re.MULTILINE),
]


def symbol(path):
    return re.sub(r"\W", "_", path)


def import_target(module, specifier):
    if not specifier.startswith("."):
        raise ValueError(f"{module}: external import is unsupported: {specifier}")
    target = posixpath.normpath(posixpath.join(posixpath.dirname(module), specifier))
    if target.startswith("../") or target.startswith("/") or not target.endswith(".js"):
        raise ValueError(f"{module}: import must resolve to a JavaScript file under src: {specifier}")
    return target


def transform(module, source):
    imports = []
    dependencies = []

    def replace_import(match):
        clause, _, specifier = match.groups()
        target = import_target(module, specifier)
        dependencies.append(target)
        namespace = "__m_" + symbol(target)
        if clause.startswith("*"):
            alias = re.fullmatch(rf"\*\s+as\s+({IDENTIFIER})", clause)[1]
            imports.append(f"const {alias} = {namespace};")
        else:
            for binding in clause[1:-1].split(","):
                binding = binding.strip()
                if not binding:
                    continue
                names = re.fullmatch(rf"({IDENTIFIER})(?:\s+as\s+({IDENTIFIER}))?", binding)
                if not names:
                    raise ValueError(f"{module}: unsupported named import: {binding}")
                name, alias = names.groups()
                imports.append(f"const {alias or name} = {namespace}.{name};")
        return ""

    # Two passes and preserved whitespace are part of the existing output format.
    body = NAMESPACE_IMPORT.sub(replace_import, source)
    body = NAMED_IMPORT.sub(replace_import, body)
    if re.search(r"^\s*import\s+(?!\()", body, re.MULTILINE):
        raise ValueError(f"{module}: unsupported import declaration")
    exports = [name for pattern in EXPORT_PATTERNS for name in pattern.findall(body)]
    body = re.sub(r"^export (?=(?:async )?function |const |let |var |class )", "", body, flags=re.MULTILINE)
    if re.search(r"^\s*export\s", body, re.MULTILINE):
        raise ValueError(f"{module}: unsupported export declaration")
    if len(set(exports)) != len(exports):
        raise ValueError(f"{module}: duplicate exported names")
    namespace = "__m_" + symbol(module)
    output = (
        f"function __init_{symbol(module)}() {{\n// MODULE: {module}\n"
        + "\n".join(imports) + "\n" + body + "\n"
        + "\n".join(f"{namespace}.{name} = {name};" for name in exports) + "\n}"
    )
    return output, dependencies, exports


def build(source_root, order_path=DEFAULT_ORDER):
    source_root = Path(source_root).resolve()
    order = json.loads(Path(order_path).read_text(encoding="utf-8"))
    if not isinstance(order, list) or not all(isinstance(path, str) for path in order):
        raise ValueError("module-order.json must be an array of source-relative paths")
    if len(set(order)) != len(order) or len({symbol(path) for path in order}) != len(order):
        raise ValueError("module-order.json contains duplicate paths or namespace collisions")

    sources, modules, exports = {}, {}, {}
    pending = [ENTRY]
    while pending:
        module = pending.pop()
        if module in sources:
            continue
        path = source_root / "src" / module
        raw = path.read_bytes()
        # The hash covers actual source bytes. Refuse newline normalization that
        # would make the transformed program differ from those bytes.
        source = raw.decode("utf-8")
        if "\r" in source:
            raise ValueError(f"{module}: normalize source newlines to LF before building")
        output, dependencies, names = transform(module, source)
        sources[module], modules[module], exports[module] = raw, output, names
        pending.extend(dependencies)
    if set(order) != set(sources):
        missing = sorted(set(sources) - set(order))
        stale = sorted(set(order) - set(sources))
        raise ValueError(f"runtime graph differs from module-order.json; review initializer order: missing={missing}, stale={stale}")

    digest = hashlib.sha256()
    for module in sorted(sources):
        digest.update(module.encode("utf-8") + b"\0" + sources[module] + b"\0")
    source_hash = digest.hexdigest()
    output = (
        "// GENERATED FILE. Do not edit by hand.\n"
        f"// Source modules: {len(order)}\n"
        f"// Source SHA-256: {source_hash}\n"
        "// Build: python3 tools/verification/build.py <source-root>\n\n"
        + "\n".join(f"const __m_{symbol(path)} = Object.create(null);" for path in sorted(order))
        + "\n\n" + "\n\n".join(modules[path] for path in order)
        + "\n\n" + "\n".join(f"__init_{symbol(path)}();" for path in order)
        + "\n\n" + "\n".join(f"export const {name} = __m_{symbol(ENTRY)}.{name};" for name in exports[ENTRY]) + "\n"
    ).encode("utf-8")
    return output, {
        "modules": len(order),
        "source_sha256": source_hash,
        "bundle_sha256": hashlib.sha256(output).hexdigest(),
    }


def sync_release_notes(source_root):
    readme = (source_root / "README.md").read_text(encoding="utf-8")
    generated = (
        "// GENERATED FROM README.md by tools/verification/build.py. Do not edit by hand.\n"
        + "export const RELEASE_README = " + json.dumps(readme, ensure_ascii=False) + ";\n"
    )
    (source_root / "src/core/releaseNotes.js").write_text(generated, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_root", nargs="?", default=".")
    parser.add_argument("--output", type=Path, help="output bundle; default: <source-root>/dist/heartbeatMemories.bundle.js")
    parser.add_argument("--check", action="store_true", help="compare output with the existing bundle without writing")
    parser.add_argument("--sync-release-notes", action="store_true", help="regenerate src/core/releaseNotes.js from README.md before building")
    parser.add_argument("--module-order", type=Path, default=DEFAULT_ORDER)
    args = parser.parse_args()
    if args.check and args.sync_release_notes:
        parser.error("--check is read-only and cannot be combined with --sync-release-notes")
    root = Path(args.source_root).resolve()
    target = args.output or root / "dist/heartbeatMemories.bundle.js"
    try:
        if args.sync_release_notes:
            sync_release_notes(root)
        output, result = build(root, args.module_order)
        if args.check:
            if target.read_bytes() != output:
                raise ValueError(f"bundle differs from current sources: {target}")
            result["check"] = "passed"
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(output)
        print(json.dumps(result, sort_keys=True))
    except (OSError, ValueError) as error:
        print(f"build failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
