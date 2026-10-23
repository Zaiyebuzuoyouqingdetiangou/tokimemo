#!/usr/bin/env python3
"""Run the checked-in healthcheck regression suite with Node's module VM enabled."""

from pathlib import Path
import subprocess
import sys


root = Path(__file__).resolve().parents[2]
tests = sorted((root / "tests").glob("healthcheck*.mjs"))
if not tests:
    sys.exit("No tests/healthcheck*.mjs regression files found")
sys.exit(subprocess.run(
    ["node", "--experimental-vm-modules", "--test", *(str(path) for path in tests)],
    cwd=root,
).returncode)
