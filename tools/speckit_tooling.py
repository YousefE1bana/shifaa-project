"""Read-only checks for mutable Spec Kit configuration, independent of feature evidence.

No initializer, lifecycle, installer, database or Docker operation is invoked.
Online origin and installed-version checks are explicit; offline checks never
claim to have verified the network or a locally installed CLI.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path, PurePosixPath

METADATA_PATHS = frozenset((
    ".specify/init-options.json", ".specify/integration.json",
    ".specify/integrations/codex.manifest.json", ".specify/integrations/speckit.manifest.json",
))
SOURCE_PATH = ".specify/tooling-source.json"
SEMVER = re.compile(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\Z")
UPSTREAM = "https://github.com/github/spec-kit.git"


def safe_path(root: Path, relative: str) -> Path:
    if (not isinstance(relative, str) or "\\" in relative or ":" in relative
            or not relative or PurePosixPath(relative).is_absolute()
            or any(part in ("", ".", "..") for part in relative.split("/"))):
        raise ValueError("unsafe tooling path")
    current = root.absolute()
    for ancestor in (*reversed(current.parents), current):
        if ancestor.is_symlink() or getattr(ancestor.lstat(), "st_file_attributes", 0) & 0x400:
            raise ValueError("linked tooling root")
    for part in relative.split("/"):
        current = current / part
        if current.exists() or current.is_symlink():
            if current.is_symlink() or getattr(current.lstat(), "st_file_attributes", 0) & 0x400:
                raise ValueError("linked tooling file")
    return current


def read_json(root: Path, relative: str) -> dict:
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = value
        return result
    raw = safe_path(root, relative).read_bytes()
    if b"\r" in raw:
        raise ValueError(f"non-LF tooling metadata: {relative}")
    value = json.loads(raw, object_pairs_hook=unique)
    if not isinstance(value, dict):
        raise ValueError(f"tooling JSON must be an object: {relative}")
    return value


def validate_configuration(root: Path, *, require_runtime: bool = False) -> dict:
    """Validate the whole operational declaration and managed source bodies.

    Version/provenance are mutable, reviewed declarations, not approval tokens.
    This checks compatibility; it confers no clinical or lifecycle authority.
    """
    state = read_json(root, ".specify/integration.json")
    if set(state) != {"version", "integration_state_schema", "installed_integrations", "integration_settings", "integration", "default_integration"}:
        raise ValueError("unexpected integration schema fields")
    version = state.get("version")
    if not isinstance(version, str) or not SEMVER.fullmatch(version):
        raise ValueError("invalid exact stable Spec Kit version")
    if (type(state.get("integration_state_schema")) is not int or state["integration_state_schema"] != 1
            or state.get("installed_integrations") != ["codex"]
            or state.get("integration") != "codex" or state.get("default_integration") != "codex"):
        raise ValueError("unsupported integration schema or topology")
    settings = state.get("integration_settings")
    if not isinstance(settings, dict) or set(settings) != {"codex"}:
        raise ValueError("unexpected integration settings")
    if settings["codex"] != {"script": "ps", "raw_options": "--skills", "parsed_options": {"skills": True}, "invoke_separator": "-"}:
        raise ValueError("Codex PowerShell/skills contract changed")
    if type(settings["codex"]["parsed_options"]["skills"]) is not bool:
        raise ValueError("skills option must be a JSON boolean")
    init = read_json(root, ".specify/init-options.json")
    if type(init.get("ai_skills")) is not bool:
        raise ValueError("initialization skills option must be a JSON boolean")
    if init != {"ai": "codex", "ai_skills": True, "feature_numbering": "sequential", "here": True,
                "integration": "codex", "script": "ps", "speckit_version": version}:
        raise ValueError("initialization metadata inconsistent")
    source = read_json(root, SOURCE_PATH)
    if (set(source) != {"schemaVersion", "repository", "version", "tag", "commit", "release"}
            or type(source["schemaVersion"]) is not int or source["schemaVersion"] != 1
            or source["repository"] != UPSTREAM or source["version"] != version
            or source["tag"] != f"v{version}"
            or source["release"] != f"https://github.com/github/spec-kit/releases/tag/v{version}"
            or not isinstance(source["commit"], str) or not re.fullmatch(r"[a-f0-9]{40}", source["commit"])):
        raise ValueError("invalid official release provenance declaration")
    missing = []
    managed_count = 0
    for integration in ("codex", "speckit"):
        manifest = read_json(root, f".specify/integrations/{integration}.manifest.json")
        if set(manifest) != {"version", "integration", "installed_at", "files"}:
            raise ValueError("unexpected managed manifest fields")
        if (manifest.get("version") != version or manifest.get("integration") != integration
                or not isinstance(manifest.get("installed_at"), str)
                or not isinstance(manifest.get("files"), dict) or not manifest["files"]):
            raise ValueError("managed manifest inconsistent")
        for path, digest in manifest["files"].items():
            prefix = ".agents/skills/speckit-" if integration == "codex" else ".specify/"
            if not path.startswith(prefix) or not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
                raise ValueError("unsafe managed manifest entry")
            target = safe_path(root, path)
            if not target.is_file() and integration == "codex" and not require_runtime:
                missing.append(path)
                continue
            if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
                raise ValueError(f"managed source drift: {path}")
            managed_count += 1
    registry = read_json(root, ".specify/workflows/workflow-registry.json")
    if registry.get("workflows", {}).get("speckit", {}).get("version") != "2.3.0":
        raise ValueError("SHIFAA workflow registration changed")
    return {"version": version, "upstreamCommit": source["commit"], "managedFilesVerified": managed_count,
            "missingLocalSkills": missing, "provenance": "DECLARATION_ONLY", "installedCli": "NOT_CHECKED",
            "clinicalAuthority": False, "lifecycleAuthorized": False}


def verify_installation(python: str, version: str, commit: str) -> dict:
    program = ("from importlib.metadata import distribution; import json; d=distribution('specify-cli'); "
               "print(json.dumps({'version':d.version,'origin':json.loads(d.read_text('direct_url.json') or '{}')}))")
    result = subprocess.run([python, "-I", "-c", program], capture_output=True, text=True, check=True, timeout=30)
    installed = json.loads(result.stdout)
    origin = installed.get("origin", {})
    if (installed.get("version") != version or origin.get("url") != UPSTREAM
            or origin.get("vcs_info", {}).get("commit_id") != commit):
        raise ValueError("installed CLI version/official immutable origin mismatch")
    return installed


def verify_upstream(source: dict) -> None:
    tag = source["tag"]
    result = subprocess.run(["git", "ls-remote", UPSTREAM, f"refs/tags/{tag}", f"refs/tags/{tag}^{{}}"],
                            capture_output=True, text=True, check=True, timeout=60)
    refs = dict((ref, commit) for commit, ref in (line.split() for line in result.stdout.splitlines()))
    if refs.get(f"refs/tags/{tag}^{{}}", refs.get(f"refs/tags/{tag}")) != source["commit"]:
        raise ValueError("official upstream tag/commit mismatch")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--require-runtime", action="store_true")
    parser.add_argument("--cli-python", help="Python from the installed specify-cli environment")
    parser.add_argument("--upstream", action="store_true", help="Read-only official Git tag verification")
    args = parser.parse_args()
    try:
        report = validate_configuration(args.root, require_runtime=args.require_runtime)
        if args.cli_python:
            report["installedCli"] = verify_installation(args.cli_python, report["version"], report["upstreamCommit"])
        if args.upstream:
            verify_upstream(read_json(args.root, SOURCE_PATH))
            report["provenance"] = "OFFICIAL_TAG_COMMIT_VERIFIED"
        print(json.dumps({"ok": True, "checks": report}, indent=2))
        return 0
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
