"""One-time canonical tooling-policy migration; never a per-release metadata gate.

The old ledger stays immutable. Only the exact policy-edit inputs recorded here
can use an older view for historical comparisons. Mutable metadata is not part
of this record, so future routine tool updates do not change it.
"""
import hashlib
import json
from pathlib import Path
import subprocess

from speckit_tooling import safe_path

RECORD = "docs/governance/tooling-maintenance-v1/historical-compatibility.json"
RECORD_SHA256 = "e38049b11787c49e01d0c6cfe0ef3cb3f825fc68f207be5bb224eebc4567fb07"


def preserved_inputs(root: Path) -> dict[str, bytes]:
    target = safe_path(root, RECORD)
    if not target.exists():
        # No record grants no canonical historical projection.
        return {}
    raw = target.read_bytes()
    if hashlib.sha256(raw).hexdigest() != RECORD_SHA256:
        raise ValueError("tooling history record changed")
    record = json.loads(raw)
    result = {}
    for item in record["inputs"]:
        current = safe_path(root, item["path"]).read_bytes()
        if len(current) != item["current"]["bytes"] or hashlib.sha256(current).hexdigest() != item["current"]["sha256"]:
            raise ValueError("tooling policy source drift: " + item["path"])
        old = item["historical"]
        if not isinstance(old["gitBlob"], str) or len(old["gitBlob"]) != 40 or any(c not in "0123456789abcdef" for c in old["gitBlob"]):
            raise ValueError("invalid historical object identity")
        restored = subprocess.run(["git", "cat-file", "blob", old["gitBlob"]], cwd=root,
                                  capture_output=True, check=False)
        if restored.returncode:
            raise ValueError("historical policy object unavailable")
        restored = restored.stdout
        if len(restored) != old["bytes"] or hashlib.sha256(restored).hexdigest() != old["sha256"]:
            raise ValueError("historical policy bytes unavailable")
        result[item["path"]] = restored
    return result
