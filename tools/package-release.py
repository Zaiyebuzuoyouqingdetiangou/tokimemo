"""Deterministic ZIP, safe fresh extraction, CRC and per-file SHA verification."""
import hashlib
import json
import pathlib
import sys
import zipfile

source = pathlib.Path(sys.argv[1]).resolve(strict=True)
output = pathlib.Path(sys.argv[2]).resolve()
fresh = pathlib.Path(sys.argv[3]).resolve()
if output.exists() or fresh.exists():
    raise SystemExit('Refusing to overwrite an existing artifact or fresh-extract directory')
if source == output or source in output.parents or source == fresh or source in fresh.parents:
    raise SystemExit('Output and extraction must be outside source')
files = sorted(p for p in source.rglob('*') if p.is_file())
if any(p.is_symlink() or '.git' in p.parts or '__pycache__' in p.parts for p in files):
    raise SystemExit('Unexpected source metadata/symlink')
output.parent.mkdir(parents=True, exist_ok=True)
digest = lambda data: hashlib.sha256(data).hexdigest().upper()
expected = {}
with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in files:
        name = 'tokimemo-main/' + file.relative_to(source).as_posix()
        data = file.read_bytes()
        expected[name] = digest(data)
        entry = zipfile.ZipInfo(name, date_time=(2026, 9, 6, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, data)
with zipfile.ZipFile(output) as archive:
    if archive.testzip() is not None:
        raise SystemExit('ZIP CRC failure')
    if len(set(archive.namelist())) != len(files):
        raise SystemExit('Duplicate/missing entry')
    for name in archive.namelist():
        path = pathlib.PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name or path.parts[0] != 'tokimemo-main':
            raise SystemExit('Unsafe ZIP entry')
        if digest(archive.read(name)) != expected[name]:
            raise SystemExit('ZIP payload differs from source')
    fresh.mkdir(parents=True)
    archive.extractall(fresh)
for name, sha in expected.items():
    if digest((fresh / name).read_bytes()) != sha:
        raise SystemExit('Fresh extraction differs')
report = {'zip': str(output), 'sha256': digest(output.read_bytes()), 'bytes': output.stat().st_size,
          'files': len(files), 'singleRoot': 'tokimemo-main', 'crc': 'pass', 'freshExtract': str(fresh),
          'perFileSha256Match': True, 'manifestVersion': json.loads((source / 'manifest.json').read_text(encoding='utf-8'))['version'],
          'fileHashes': expected}
output.with_suffix('.verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k != 'fileHashes'}, ensure_ascii=False))
