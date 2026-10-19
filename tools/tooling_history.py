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


VERIFICATION_RECORD = "docs/governance/safe-verification-v1/historical-inputs.json"
VERIFICATION_RECORD_SHA256 = "236315c883e1ac3d84efab66e5e100c6934e4e5aeabf414b94698c2cffe4ef18"


def verification_inputs(root: Path) -> dict[str, bytes]:
    target = safe_path(root, VERIFICATION_RECORD)
    if not target.exists():
        return {}
    raw = target.read_bytes()
    if hashlib.sha256(raw).hexdigest() != VERIFICATION_RECORD_SHA256:
        raise ValueError("verification history binding drift")
    record = json.loads(raw)
    if record["identity"] != "SHIFAA-SAFE-VERIFICATION-HISTORY/1" or record["clinicalAuthority"] is not False or record["freshPhysicalAcceptance"] is not False:
        raise ValueError("invalid verification history authority")
    for item in record["currentInputs"]:
        current = safe_path(root, item["path"]).read_bytes()
        if len(current) != item["bytes"] or hashlib.sha256(current).hexdigest() != item["sha256"]:
            raise ValueError("operational source drift: " + item["path"])
    result = {}
    for item in record["inputs"]:
        old = item["historical"]
        if len(old["gitBlob"]) != 40 or any(c not in "0123456789abcdef" for c in old["gitBlob"]):
            raise ValueError("invalid historical verification object")
        restored = subprocess.run(["git", "cat-file", "blob", old["gitBlob"]], cwd=root, capture_output=True, check=True).stdout
        if len(restored) != old["bytes"] or hashlib.sha256(restored).hexdigest() != old["sha256"]:
            raise ValueError("historical verification bytes drift")
        result[item["path"]] = restored
    return result


def preserved_inputs(root: Path) -> dict[str, bytes]:
    operational = verification_inputs(root)
    target = safe_path(root, RECORD)
    if not target.exists():
        # No record grants no canonical historical projection.
        return operational
    raw = target.read_bytes()
    if hashlib.sha256(raw).hexdigest() != RECORD_SHA256:
        raise ValueError("tooling history record changed")
    record = json.loads(raw)
    result = dict(operational)
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
