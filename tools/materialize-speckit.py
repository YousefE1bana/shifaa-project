"""Materialize only hash-bound official command skills; never run a lifecycle."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile

from speckit_tooling import safe_path, validate_configuration, verify_installation


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    config = validate_configuration(root)
    verify_installation(sys.executable, config["version"], config["upstreamCommit"])
    # Imported only after exact installed distribution/origin verification.
    from specify_cli.integrations.codex import CodexIntegration
    from specify_cli.integrations.manifest import IntegrationManifest

    expected = json.loads((root / ".specify/integrations/codex.manifest.json").read_text())["files"]
    local = root / ".tmp"
    local.mkdir(exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix="speckit-materialize-", dir=local)).resolve()
    manifest = IntegrationManifest("codex", stage, config["version"])
    CodexIntegration().install(stage, manifest, parsed_options={"skills": True}, script_type="ps", events={})
    pending = []
    for rel, digest in expected.items():
        if not rel.startswith(".agents/skills/speckit-") or not rel.endswith("/SKILL.md"):
            raise ValueError("Unexpected official command destination")
        source, target = safe_path(stage, rel), safe_path(root, rel)
        if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Generated official command differs from reviewed manifest: {rel}")
        if target.exists():
            if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
                raise ValueError(f"Existing local command differs; preserved without overwrite: {rel}")
        else:
            pending.append((source, target))
    for source, target in pending:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    print(json.dumps({"version": config["version"], "created": len(pending), "verified": len(expected), "lifecycleExecuted": False}))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, ImportError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
