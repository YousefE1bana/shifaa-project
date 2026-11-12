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
APPENDIX_SUCCESSOR = "specs/012-prescription-safety-governed-overrides/readiness/historical-reader-repair-2026-11-12/successor-binding-v1.json"
APPENDIX_SUCCESSOR_SHA256 = "8b6500c6571bf2c0d75373483452e0942be0c1e1104ca66de05dc35689bfc8b1"


def approved_appendix_predecessors(root: Path) -> dict[str, bytes]:
    target = safe_path(root, APPENDIX_SUCCESSOR)
    if not target.exists():
        return {}
    raw = target.read_bytes()
    if hashlib.sha256(raw).hexdigest() != APPENDIX_SUCCESSOR_SHA256:
        raise ValueError("appendix successor binding drift")
    binding = json.loads(raw)
    if (binding["bindingId"] != "SHIFAA-F012-PLAN-HISTORICAL-READER-SUCCESSOR/1.0.0"
            or binding["historicalRecord"] != {"path": RECORD, "sha256": RECORD_SHA256}):
        raise ValueError("appendix successor identity drift")
    predecessors = {}
    for item in binding["inputs"]:
        current = safe_path(root, item["path"]).read_bytes()
        previous, successor, appendix = item["predecessor"], item["successor"], item["appendix"]
        prefix, added = current[:appendix["offset"]], current[appendix["offset"]:]
        if (len(current) != successor["bytes"] or hashlib.sha256(current).hexdigest() != successor["sha256"]
                or appendix["offset"] != previous["bytes"] or len(prefix) != previous["bytes"]
                or hashlib.sha256(prefix).hexdigest() != previous["sha256"]
                or len(added) != appendix["bytes"] or hashlib.sha256(added).hexdigest() != appendix["sha256"]):
            raise ValueError("appendix successor source drift: " + item["path"])
        blob = previous["gitBlob"]
        if not isinstance(blob, str) or len(blob) != 40 or any(c not in "0123456789abcdef" for c in blob):
            raise ValueError("invalid appendix predecessor object")
        restored = subprocess.run(["git", "cat-file", "blob", blob], cwd=root, capture_output=True, check=True).stdout
        if restored != prefix:
            raise ValueError("appendix predecessor Git bytes drift")
        predecessors[item["path"]] = prefix
    return predecessors


def preserved_inputs(root: Path) -> dict[str, bytes]:
    target = safe_path(root, RECORD)
    if not target.exists():
        # No record grants no canonical historical projection.
        return {}
    raw = target.read_bytes()
    if hashlib.sha256(raw).hexdigest() != RECORD_SHA256:
        raise ValueError("tooling history record changed")
    record = json.loads(raw)
    predecessors = approved_appendix_predecessors(root)
    result = dict(predecessors)
    for item in record["inputs"]:
        current = predecessors.get(item["path"])
        if current is None:
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
