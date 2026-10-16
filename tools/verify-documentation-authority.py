#!/usr/bin/env python3
"""Read-only documentation checks; no approval or lifecycle is performed.

CURRENT (default, --mode current): retain pinned historical/approval inputs,
baseline inventory and accounting checks, but permit later non-protected docs.
New/changed docs are reported as UNCLASSIFIED, never as approved authority.
The inventory describes the baseline, not a permanent file-immutability policy.

PACKAGE (--mode package --inventory-sha256 REVIEWED_SHA256): additionally enforce
the exact 28-path release, 27 artifact digests, safe dependency references and
the externally reviewed inventory identity. The inventory never hashes itself.

Optional CURRENT --successor-binding PATH --successor-binding-sha256 REVIEWED_SHA
recognizes only an integrated, externally hash-bound ADDITIVE documentation
locator. It never replaces protected bytes, grants clinical/legal/lifecycle
authority, or changes F011 projections. The record and its approval must already
be committed; all declared artifacts are checked in that recorded Git commit.
It is verification evidence, not a new governance approval procedure. An operator
must obtain the exact record digest through the existing approval process.
Both modes are non-mutating; no hooks, fetch, index refresh or lifecycle commands.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import subprocess
import tomllib
import unicodedata
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit


MODERNIZATION_DIR = "docs/governance/repository-modernization-v1"
BASELINE_FILE = f"{MODERNIZATION_DIR}/baseline-and-protection.json"
STATUS_FILE = f"{MODERNIZATION_DIR}/feature-status-map.json"
INVENTORY_FILE = f"{MODERNIZATION_DIR}/documentation-inventory.jsonl"
PUBLICATION_FILE = f"{MODERNIZATION_DIR}/publication-inventory.json"
BASELINE_SHA256 = "bf53264a9ce6fcaa3c0467a398a9c6aa2c67d4cd57068c9db9c3a9250bfba429"
F011_PATH = "specs/011-allergies-clinical-content-governance"
REQUIRED_SKILLS = (
    ".shifaa/skills/shifaa-project-guardrails/SKILL.md",
    ".shifaa/skills/shifaa-ui-governor/SKILL.md",
    ".shifaa/skills/shifaa-third-party-skill-overlay/SKILL.md",
    ".shifaa/skills/shifaa-speckit-overlay/SKILL.md",
)
REQUIRED_MARKDOWN = (
    "AGENTS.md",
    *REQUIRED_SKILLS,
    "docs/agent-skills/README.md",
    "docs/SHIFAA-Documentation-Index.md",
    "docs/SHIFAA-Operational-Guide-v1.md",
    "docs/governance/SHIFAA-Current-Authority-Map-v1.md",
)
ROLE_NAMES = ("explorer", "worker", "deep-worker", "tester", "ui-worker")
ROLE_FILES = {name: f"agents/{name}.toml" for name in ROLE_NAMES}
CLASSIFICATIONS = {
    "CURRENT_CANONICAL",
    "CURRENT_ADDITIVE_SUCCESSOR",
    "HISTORICAL_IMMUTABLE",
    "DRAFT_OR_PROPOSED",
    "SUPERSEDED",
    "OUTDATED_ACTIONABLE",
    "CONFLICTED",
    "MISSING_DOCUMENTATION",
    "NEEDS_AUTHORITY_DECISION",
}
EXPECTED_ACCOUNTING = {
    "F012": 12,
    "active": 244,
    "reserved": 6,
    "total": 250,
    "F014": 16,
    "F007_024": 172,
    "F012_024": 122,
    "F026": 244,
}
RELEVANT_DIRS = (
    "specs/",
    "docs/",
    ".specify/",
    ".shifaa/",
    ".codex/",
    "infra/runbooks/",
    ".github/",
    "packages/contracts/",
    "packages/api-client/",
)
TEXT_DOC_SUFFIXES = (".md", ".mdx", ".rst", ".adoc", ".txt")
REQUIRED_INVENTORY_FIELDS = (
    "path",
    "classification",
    "owner",
    "authorityCommit",
    "version",
    "source",
    "issue",
    "impact",
    "protection",
    "recommendedAction",
    "bytes",
    "sha256",
    "gitBlob",
)
ROOT_SECURITY_KEYS = {
    "model",
    "sandbox",
    "sandboxmode",
    "sandboxapproval",
    "approval",
    "approvalpolicy",
    "network",
    "networkaccess",
    "networkguardian",
}


def normalized_path(value: object) -> str | None:
    if not isinstance(value, str) or not value or "\\" in value or "\0" in value:
        return None
    if re.match(r"^[A-Za-z]:", value):
        return None
    if any(part in ("", ".", "..") for part in value.split("/")):
        return None
    path = PurePosixPath(value)
    if path.is_absolute():
        return None
    return path.as_posix()


def inside(root: Path, candidate: Path) -> bool:
    try:
        candidate.resolve(strict=False).relative_to(root.resolve())
        return True
    except ValueError:
        return False


def safe_file(root: Path, relative: str) -> Path | None:
    normalized = normalized_path(relative)
    if normalized is None:
        return None
    candidate = root.joinpath(*PurePosixPath(normalized).parts)
    return candidate if inside(root, candidate) else None


def git_run(root: Path, arguments: list[str], input_bytes: bytes | None = None) -> subprocess.CompletedProcess[bytes]:
    environment = os.environ.copy()
    environment["GIT_OPTIONAL_LOCKS"] = "0"
    if arguments and arguments[0] == "diff":
        arguments = ["diff", "--no-ext-diff", "--no-textconv", *arguments[1:]]
    return subprocess.run(
        ["git", "--no-pager", "-c", "core.longpaths=true", "-c", "core.fsmonitor=false",
         "-c", "diff.autoRefreshIndex=false", *arguments],
        cwd=root,
        env=environment,
        input=input_bytes,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )


def git_bytes(root: Path, *arguments: str) -> bytes:
    completed = git_run(root, list(arguments))
    if completed.returncode:
        raise RuntimeError("git command failed")
    return completed.stdout


def git_text(root: Path, *arguments: str) -> str:
    return git_bytes(root, *arguments).decode("utf-8", errors="strict").strip()


def git_paths(root: Path, *arguments: str) -> set[str]:
    raw_paths = git_bytes(root, *arguments)
    return {entry.decode("utf-8", errors="surrogateescape") for entry in raw_paths.split(b"\0") if entry}


def git_tree_blobs(root: Path, commit: str) -> dict[str, str]:
    entries = git_bytes(root, "ls-tree", "-r", "-z", commit).split(b"\0")
    blobs: dict[str, str] = {}
    for entry in entries:
        if not entry:
            continue
        metadata, relative = entry.split(b"\t", maxsplit=1)
        _mode, object_type, object_id = metadata.split()
        if object_type == b"blob":
            blobs[relative.decode("utf-8", errors="surrogateescape")] = object_id.decode("ascii")
    return blobs


def git_blob_metadata(root: Path, object_ids: set[str]) -> dict[str, tuple[int, str]]:
    if not object_ids:
        return {}
    request = ("\n".join(sorted(object_ids)) + "\n").encode("ascii")
    completed = git_run(root, ["cat-file", "--batch"], request)
    if completed.returncode:
        raise RuntimeError("git batch read failed")
    output = completed.stdout
    metadata: dict[str, tuple[int, str]] = {}
    offset = 0
    for requested_id in sorted(object_ids):
        header_end = output.find(b"\n", offset)
        if header_end < 0:
            raise RuntimeError("git batch response malformed")
        header = output[offset:header_end].split()
        if len(header) != 3 or header[1] != b"blob":
            raise RuntimeError("git batch object unavailable")
        size = int(header[2])
        start = header_end + 1
        end = start + size
        raw_blob = output[start:end]
        if len(raw_blob) != size or output[end : end + 1] != b"\n":
            raise RuntimeError("git batch content malformed")
        metadata[requested_id] = (size, digest(raw_blob))
        offset = end + 1
    return metadata


def git_blob_contents(root: Path, object_ids: set[str]) -> dict[str, bytes]:
    if not object_ids:
        return {}
    requested_ids = sorted(object_ids)
    request = ("\n".join(requested_ids) + "\n").encode("ascii")
    completed = git_run(root, ["cat-file", "--batch"], request)
    if completed.returncode:
        raise RuntimeError("git batch read failed")
    output = completed.stdout
    contents: dict[str, bytes] = {}
    offset = 0
    for requested_id in requested_ids:
        header_end = output.find(b"\n", offset)
        if header_end < 0:
            raise RuntimeError("git batch response malformed")
        header = output[offset:header_end].split()
        if len(header) != 3 or header[1] != b"blob":
            raise RuntimeError("git batch object unavailable")
        size = int(header[2])
        start = header_end + 1
        end = start + size
        raw_blob = output[start:end]
        if len(raw_blob) != size or output[end : end + 1] != b"\n":
            raise RuntimeError("git batch content malformed")
        contents[requested_id] = raw_blob
        offset = end + 1
    return contents


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def add_error(errors: list[dict[str, str]], code: str, path: str | None = None) -> None:
    error = {"code": code}
    if path is not None:
        error["path"] = path
    errors.append(error)


def json_object(root: Path, relative: str, errors: list[dict[str, str]]) -> dict | None:
    source = safe_file(root, relative)
    if source is None or not source.is_file():
        add_error(errors, "required_file_missing", relative)
        return None
    try:
        parsed = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        add_error(errors, "json_invalid", relative)
        return None
    if not isinstance(parsed, dict):
        add_error(errors, "json_root_not_object", relative)
        return None
    return parsed


def check_current_head(root: Path, manifest: dict, errors: list[dict[str, str]], checks: dict) -> str | None:
    baseline = manifest.get("baselineCommit")
    try:
        actual = git_text(root, "rev-parse", "HEAD")
    except (OSError, RuntimeError, UnicodeError):
        add_error(errors, "git_head_unavailable")
        checks["head_matches_baseline"] = False
        return None
    if not isinstance(baseline, str) or not baseline:
        add_error(errors, "baseline_commit_invalid", BASELINE_FILE)
        checks["baseline_is_ancestor"] = False
        return None
    ancestor_result = git_run(root, ["merge-base", "--is-ancestor", baseline, "HEAD"])
    is_ancestor = ancestor_result.returncode == 0
    checks["baseline_is_ancestor"] = is_ancestor
    checks["head_commit"] = actual
    if not is_ancestor:
        code = "baseline_not_ancestor_of_head" if ancestor_result.returncode == 1 else "baseline_ancestry_check_failed"
        add_error(errors, code)
        return None
    return baseline


def check_protected_files(root: Path, manifest: dict, commit: str | None, errors: list[dict[str, str]], checks: dict) -> None:
    entries = manifest.get("protectedArtifacts")
    if not isinstance(entries, list):
        add_error(errors, "protected_artifacts_invalid", BASELINE_FILE)
        checks["protected_artifacts"] = False
        return
    count = len(entries)
    valid: list[tuple[dict, str, bytes]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            add_error(errors, "protected_entry_invalid", BASELINE_FILE)
            continue
        path = normalized_path(entry.get("path"))
        if path is None:
            add_error(errors, "protected_path_invalid", BASELINE_FILE)
            continue
        current = safe_file(root, path)
        if current is None or not current.is_file():
            add_error(errors, "protected_current_missing", path)
            continue
        try:
            current_bytes = current.read_bytes()
        except OSError:
            add_error(errors, "protected_current_unreadable", path)
            continue
        valid.append((entry, path, current_bytes))
    history: dict[str, bytes] = {}
    if commit is not None and valid:
        try:
            tree = git_tree_blobs(root, commit)
            object_by_path = {path: tree[path] for _, path, _ in valid if path in tree}
            for _, path, _ in valid:
                if path not in object_by_path:
                    add_error(errors, "protected_history_unavailable", path)
            history = git_blob_contents(root, set(object_by_path.values()))
        except (OSError, RuntimeError, UnicodeError):
            for _, path, _ in valid:
                add_error(errors, "protected_history_unavailable", path)
            object_by_path = {}
    else:
        object_by_path = {}
    for entry, path, current_bytes in valid:
        expected_size = entry.get("bytes")
        expected_hash = entry.get("sha256")
        expected_blob = entry.get("gitBlob")
        if isinstance(expected_size, bool) or not isinstance(expected_size, int) or expected_size != len(current_bytes):
            add_error(errors, "protected_current_size_mismatch", path)
        if not isinstance(expected_hash, str) or digest(current_bytes) != expected_hash:
            add_error(errors, "protected_current_hash_mismatch", path)
        if commit is None:
            continue
        actual_blob = object_by_path.get(path)
        if actual_blob is None or actual_blob not in history:
            continue
        if not isinstance(expected_blob, str) or expected_blob != actual_blob:
            add_error(errors, "protected_git_blob_mismatch", path)
        history_bytes = history[actual_blob]
        if len(history_bytes) != expected_size or digest(history_bytes) != expected_hash:
            add_error(errors, "protected_history_digest_mismatch", path)
        if current_bytes != history_bytes:
            add_error(errors, "protected_current_differs_from_history", path)
    checks["protected_artifacts"] = not any(error["code"].startswith("protected_") for error in errors)
    checks["protected_artifact_count"] = count


def check_f011(root: Path, manifest: dict, commit: str | None, errors: list[dict[str, str]], checks: dict) -> None:
    record = manifest.get("f011")
    if not isinstance(record, dict):
        add_error(errors, "f011_record_invalid", BASELINE_FILE)
        checks["f011_unchanged"] = False
        return
    path = normalized_path(record.get("path"))
    count = record.get("files")
    expected_tree = record.get("gitTree")
    if path != F011_PATH or isinstance(count, bool) or not isinstance(count, int) or not isinstance(expected_tree, str):
        add_error(errors, "f011_record_invalid", BASELINE_FILE)
        checks["f011_unchanged"] = False
        return
    if commit is None:
        checks["f011_unchanged"] = False
        return
    try:
        committed_changes = git_paths(root, "diff", "--name-only", "-z", commit, "HEAD", "--", f"{path}/")
        worktree_changes = git_paths(root, "diff", "--name-only", "-z", "HEAD", "--", f"{path}/")
        current_tree = git_text(root, "rev-parse", "--verify", f"HEAD:{path}")
        names = git_paths(root, "ls-tree", "-r", "--name-only", "-z", "HEAD", "--", f"{path}/")
    except (OSError, RuntimeError, UnicodeError):
        add_error(errors, "f011_tree_unavailable", path)
        checks["f011_unchanged"] = False
        return
    unchanged = not committed_changes and not worktree_changes and current_tree == expected_tree and len(names) == count
    checks["f011_file_count"] = len(names)
    checks["f011_unchanged"] = unchanged
    if committed_changes or worktree_changes:
        add_error(errors, "f011_tracked_files_changed", path)
    if current_tree != expected_tree:
        add_error(errors, "f011_tree_mismatch", path)
    if len(names) != count:
        add_error(errors, "f011_file_count_mismatch", path)


def check_candidate_diff(root: Path, manifest: dict, baseline: str | None, errors: list[dict[str, str]], checks: dict) -> None:
    allowlist = manifest.get("candidateAllowlist")
    if not isinstance(allowlist, list):
        add_error(errors, "candidate_allowlist_invalid", BASELINE_FILE)
        checks["candidate_diff_allowed"] = False
        return
    normalized_allowlist = {normalized_path(item) for item in allowlist}
    if None in normalized_allowlist or len(normalized_allowlist) != len(allowlist):
        add_error(errors, "candidate_allowlist_path_invalid", BASELINE_FILE)
    normalized_allowlist.discard(None)
    try:
        committed = git_paths(root, "diff", "--name-only", "--no-renames", "-z", baseline or "HEAD", "HEAD", "--")
        worktree = git_paths(root, "diff", "--name-only", "--no-renames", "-z", "HEAD", "--")
        untracked = git_paths(root, "ls-files", "--others", "--exclude-standard", "-z")
    except (OSError, RuntimeError, UnicodeError):
        add_error(errors, "candidate_diff_unavailable")
        checks["candidate_diff_allowed"] = False
        return
    candidate_paths = committed | worktree | untracked
    unexpected = sorted(candidate_paths - normalized_allowlist)
    checks["candidate_diff_count"] = len(candidate_paths)
    checks["candidate_diff_allowed"] = not unexpected
    for path in unexpected:
        add_error(errors, "candidate_path_not_allowlisted", path)


def is_relevant_tracked(path: str) -> bool:
    return path.startswith(RELEVANT_DIRS) or path.lower().endswith(TEXT_DOC_SUFFIXES)


def parse_inventory(inventory_path: Path, errors: list[dict[str, str]]) -> list[dict]:
    entries: list[dict] = []
    seen: set[str] = set()
    try:
        lines = inventory_path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        add_error(errors, "inventory_unreadable", INVENTORY_FILE)
        return entries
    for number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            add_error(errors, "inventory_json_invalid", f"{INVENTORY_FILE}:{number}")
            continue
        if not isinstance(entry, dict):
            add_error(errors, "inventory_entry_not_object", f"{INVENTORY_FILE}:{number}")
            continue
        path = normalized_path(entry.get("path"))
        if path is None:
            add_error(errors, "inventory_path_invalid", f"{INVENTORY_FILE}:{number}")
            continue
        if path.casefold() in seen:
            add_error(errors, "inventory_path_duplicate", path)
        seen.add(path.casefold())
        entries.append(entry)
    return entries


def validate_inventory_fields(root: Path, entry: dict, errors: list[dict[str, str]], *, require_current: bool = True) -> str:
    path = normalized_path(entry.get("path")) or ""
    if set(entry) - set(REQUIRED_INVENTORY_FIELDS):
        add_error(errors, "inventory_fields_unexpected", path)
    if any(field not in entry for field in REQUIRED_INVENTORY_FIELDS):
        add_error(errors, "inventory_fields_missing", path)
    if entry.get("classification") not in CLASSIFICATIONS:
        add_error(errors, "inventory_classification_invalid", path)
    target = safe_file(root, path)
    if target is None or (require_current and not target.is_file()):
        add_error(errors, "inventory_file_missing", path)
    for field in ("owner", "authorityCommit", "version", "source", "issue", "impact", "protection", "recommendedAction"):
        if not isinstance(entry.get(field), str):
            add_error(errors, "inventory_metadata_invalid", path)
            break
    if isinstance(entry.get("bytes"), bool) or not isinstance(entry.get("bytes"), int) or entry.get("bytes") < 0:
        add_error(errors, "inventory_digest_metadata_invalid", path)
    if entry.get("sha256") is not None and not isinstance(entry.get("sha256"), str):
        add_error(errors, "inventory_digest_metadata_invalid", path)
    if entry.get("gitBlob") is not None and not isinstance(entry.get("gitBlob"), str):
        add_error(errors, "inventory_digest_metadata_invalid", path)
    return path


def validate_inventory_baseline(path: str, entry: dict, tracked_blobs: dict[str, str], blob_hashes: dict[str, tuple[int, str]], errors: list[dict[str, str]]) -> None:
    blob = tracked_blobs.get(path)
    if blob is None:
        return
    metadata = blob_hashes.get(blob)
    if metadata is None:
        add_error(errors, "inventory_head_blob_unavailable", path)
        return
    size, sha256 = metadata
    if entry.get("gitBlob") != blob or entry.get("bytes") != size or entry.get("sha256") != sha256:
        add_error(errors, "inventory_head_digest_mismatch", path)


def check_inventory_coverage(entries: list[dict], tracked_paths: set[str], errors: list[dict[str, str]], checks: dict) -> None:
    covered = {entry["path"] for entry in entries if isinstance(entry.get("path"), str)}
    for path in sorted(tracked_paths - covered):
        add_error(errors, "inventory_tracked_path_missing", path)
    checks["inventory_entry_count"] = len(entries)
    checks["inventory_tracked_count"] = len(tracked_paths)
    checks["inventory_coverage_count"] = len(tracked_paths & covered)


def check_inventory(root: Path, commit: str | None, errors: list[dict[str, str]], checks: dict, *, mode: str = "package") -> None:
    inventory_path = safe_file(root, INVENTORY_FILE)
    if inventory_path is None or not inventory_path.is_file():
        add_error(errors, "required_file_missing", INVENTORY_FILE)
        checks["inventory_valid"] = False
        return
    try:
        tracked_blobs = git_tree_blobs(root, commit or "HEAD")
        tracked_paths = {path for path in tracked_blobs if is_relevant_tracked(path)}
        blob_hashes = git_blob_metadata(root, {tracked_blobs[path] for path in tracked_paths})
    except (OSError, RuntimeError, UnicodeError):
        tracked_blobs, tracked_paths, blob_hashes = {}, set(), {}
        add_error(errors, "inventory_tracked_files_unavailable")
    entries = parse_inventory(inventory_path, errors)
    for entry in entries:
        path = validate_inventory_fields(root, entry, errors, require_current=mode == "package")
        validate_inventory_baseline(path, entry, tracked_blobs, blob_hashes, errors)
    check_inventory_coverage(entries, tracked_paths, errors, checks)
    checks["inventory_valid"] = not any(error["code"].startswith("inventory_") for error in errors)


def check_status_map(root: Path, errors: list[dict[str, str]], checks: dict) -> None:
    status = json_object(root, STATUS_FILE, errors)
    if status is None:
        checks["feature_status_valid"] = False
        return
    accounting = status.get("operationAccounting")
    accounting_matches = isinstance(accounting, dict) and accounting == EXPECTED_ACCOUNTING
    schema_version_valid = not isinstance(status.get("schemaVersion"), bool) and status.get("schemaVersion") == 1
    if not schema_version_valid:
        add_error(errors, "feature_status_schema_invalid", STATUS_FILE)
    if not accounting_matches:
        add_error(errors, "feature_operation_accounting_mismatch", STATUS_FILE)
    if status.get("lifecycleAuthorized") is not False:
        add_error(errors, "feature_lifecycle_must_remain_unauthorized", STATUS_FILE)
    if status.get("clinicalApproval") is not False:
        add_error(errors, "feature_clinical_approval_must_remain_false", STATUS_FILE)
    checks["feature_status_valid"] = (
        schema_version_valid
        and accounting_matches
        and status.get("lifecycleAuthorized") is False
        and status.get("clinicalApproval") is False
    )


def config_path(root: Path, value: object) -> Path | None:
    if not isinstance(value, str):
        return None
    normalized = normalized_path(value)
    if normalized is None:
        return None
    base = root / ".codex"
    candidate = base.joinpath(*PurePosixPath(normalized).parts)
    try:
        candidate.resolve(strict=False).relative_to(base.resolve())
    except ValueError:
        return None
    return candidate


def parse_toml(path: Path) -> dict | None:
    try:
        parsed = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, tomllib.TOMLDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def check_agent_configuration(root: Path, errors: list[dict[str, str]], checks: dict) -> None:
    config = parse_toml(root / ".codex/config.toml")
    if config is None:
        add_error(errors, "agent_config_invalid", ".codex/config.toml")
        checks["agent_configuration_valid"] = False
        return
    root_keys = {re.sub(r"[_-]", "", key).casefold() for key in config}
    if root_keys & ROOT_SECURITY_KEYS:
        add_error(errors, "agent_root_security_key_present", ".codex/config.toml")
    agents = config.get("agents")
    if not isinstance(agents, dict):
        add_error(errors, "agent_roles_invalid", ".codex/config.toml")
        checks["agent_configuration_valid"] = False
        return
    role_settings = {"enabled", "default_subagent_model", "default_subagent_reasoning_effort", "max_concurrent_threads_per_session", "interrupt_message"}
    declared_roles = {key for key, value in agents.items() if isinstance(value, dict)}
    if declared_roles != set(ROLE_NAMES):
        add_error(errors, "agent_role_set_mismatch", ".codex/config.toml")
    if set(agents) - set(ROLE_NAMES) - role_settings:
        add_error(errors, "agent_role_set_mismatch", ".codex/config.toml")
    if agents.get("max_concurrent_threads_per_session") != 2:
        add_error(errors, "agent_concurrency_limit_mismatch", ".codex/config.toml")
    features = config.get("features")
    multi_agent = features.get("multi_agent_v2") if isinstance(features, dict) else None
    if not isinstance(multi_agent, dict) or multi_agent.get("max_concurrent_threads_per_session") != 2:
        add_error(errors, "agent_feature_concurrency_limit_mismatch", ".codex/config.toml")
    expected_files = {f".codex/{relative}" for relative in ROLE_FILES.values()}
    loaded_files = {".codex/config.toml"}
    for role in ROLE_NAMES:
        role_config = agents.get(role)
        if not isinstance(role_config, dict):
            continue
        config_file = role_config.get("config_file")
        expected = ROLE_FILES[role]
        if config_file != expected:
            add_error(errors, "agent_role_config_mapping_mismatch", ".codex/config.toml")
        resolved = config_path(root, config_file)
        if resolved is None or not resolved.is_file():
            add_error(errors, "agent_role_config_path_invalid", ".codex/config.toml")
            continue
        loaded_files.add(resolved.relative_to(root).as_posix())
    for relative in sorted(expected_files | loaded_files):
        parsed = parse_toml(root / relative)
        if parsed is None:
            add_error(errors, "agent_role_toml_invalid", relative)
    checks["agent_role_count"] = len(declared_roles)
    checks["agent_toml_count"] = len(expected_files) + 1
    checks["agent_configuration_valid"] = not any(error["code"].startswith("agent_") for error in errors)


def markdown_lines_without_fences(markdown: str) -> list[str]:
    output: list[str] = []
    fence_char: str | None = None
    fence_size = 0
    for line in markdown.splitlines():
        marker = re.match(r"^\s{0,3}(`{3,}|~{3,})", line)
        if marker:
            token = marker.group(1)
            if fence_char is None:
                fence_char, fence_size = token[0], len(token)
            elif token[0] == fence_char and len(token) >= fence_size:
                fence_char, fence_size = None, 0
            continue
        if fence_char is None:
            output.append(line)
        else:
            output.append("")
    return output


def heading_anchor(heading: str) -> str:
    value = html.unescape(heading).strip().lower()
    value = re.sub(r"`([^`]*)`", r"\1", value)
    value = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", value)
    value = re.sub(r"<[^>]+>", "", value)
    slug_chars: list[str] = []
    pending_hyphen = False
    for character in value:
        category = unicodedata.category(character)
        if character.isspace():
            pending_hyphen = bool(slug_chars)
        elif character == "-" or character == "_" or category[0] in ("L", "N", "M"):
            if pending_hyphen and slug_chars and slug_chars[-1] != "-":
                slug_chars.append("-")
            slug_chars.append(character)
            pending_hyphen = False
    return "".join(slug_chars).strip("-")


def markdown_anchors(lines: list[str]) -> set[str]:
    anchors: set[str] = set()
    duplicates: dict[str, int] = {}
    for line in lines:
        for explicit in re.findall(r"<(?:a|h[1-6])\b[^>]*\bid=[\"']([^\"']+)[\"']", line, re.IGNORECASE):
            anchors.add(html.unescape(explicit))
        heading = re.match(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$", line)
        if not heading:
            continue
        base = heading_anchor(heading.group(1))
        ordinal = duplicates.get(base, 0)
        duplicates[base] = ordinal + 1
        anchors.add(base if ordinal == 0 else f"{base}-{ordinal}")
    return anchors


def markdown_link_errors(root: Path, relative: str) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    source = safe_file(root, relative)
    if source is None or not source.is_file():
        return [{"code": "markdown_source_missing", "path": relative}]
    try:
        markdown = source.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return [{"code": "markdown_source_unreadable", "path": relative}]
    lines = markdown_lines_without_fences(markdown)
    patterns = re.compile(r"!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)")
    for line_number, line in enumerate(lines, start=1):
        for match in patterns.finditer(line):
            destination = match.group(1) or match.group(2) or ""
            if not destination or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", destination) or destination.startswith("//"):
                continue
            parsed = urlsplit(destination)
            target_text = unquote(parsed.path)
            fragment = unquote(parsed.fragment)
            if target_text.startswith("/"):
                candidate = root.joinpath(*PurePosixPath(target_text.lstrip("/")).parts)
            elif target_text:
                candidate = source.parent.joinpath(*PurePosixPath(target_text).parts)
            else:
                candidate = source
            if not inside(root, candidate):
                errors.append({"code": "markdown_link_outside_root", "path": f"{relative}:{line_number}"})
                continue
            if candidate.is_dir():
                candidate = next((candidate / index for index in ("README.md", "index.md") if (candidate / index).is_file()), candidate)
            if not candidate.is_file():
                errors.append({"code": "markdown_link_target_missing", "path": f"{relative}:{line_number}"})
                continue
            if not fragment:
                continue
            if re.fullmatch(r"L\d+(?:-L?\d+)?", fragment):
                line_match = re.fullmatch(r"L(\d+)(?:-L?(\d+))?", fragment)
                assert line_match is not None
                try:
                    document_line_count = len(candidate.read_text(encoding="utf-8").splitlines())
                except (OSError, UnicodeError):
                    errors.append({"code": "markdown_anchor_target_unreadable", "path": f"{relative}:{line_number}"})
                    continue
                first = int(line_match.group(1))
                last = int(line_match.group(2) or first)
                if first < 1 or last < first or last > document_line_count:
                    errors.append({"code": "markdown_line_anchor_missing", "path": f"{relative}:{line_number}"})
                continue
            try:
                target_lines = markdown_lines_without_fences(candidate.read_text(encoding="utf-8"))
            except (OSError, UnicodeError):
                errors.append({"code": "markdown_anchor_target_unreadable", "path": f"{relative}:{line_number}"})
                continue
            if fragment not in markdown_anchors(target_lines):
                errors.append({"code": "markdown_heading_anchor_missing", "path": f"{relative}:{line_number}"})
    return errors


def check_markdown_links(root: Path, errors: list[dict[str, str]], checks: dict) -> None:
    markdown_paths = list(REQUIRED_MARKDOWN)
    modernization = root / MODERNIZATION_DIR
    if modernization.is_dir():
        markdown_paths.extend(
            path.relative_to(root).as_posix()
            for path in sorted(modernization.rglob("*.md"))
            if inside(root, path)
        )
    for relative in dict.fromkeys(markdown_paths):
        errors.extend(markdown_link_errors(root, relative))
    checks["markdown_source_count"] = len(set(markdown_paths))
    checks["markdown_links_valid"] = not any(error["code"].startswith("markdown_") for error in errors)


def artifact_bytes(root: Path, entry: object) -> bytes:
    """Validate an untrusted descriptor without publishing or modifying it."""
    if not isinstance(entry, dict):
        raise ValueError("invalid artifact descriptor")
    source = safe_file(root, entry.get("path"))
    if source is None or not source.is_file():
        raise ValueError("missing artifact")
    raw = source.read_bytes()
    if type(entry.get("bytes")) is not int or len(raw) != entry["bytes"] or digest(raw) != entry.get("sha256"):
        raise ValueError("artifact digest mismatch")
    return raw


def check_package(root: Path, manifest: dict, expected_hash: str | None, errors: list[dict[str, str]], checks: dict) -> None:
    source = safe_file(root, PUBLICATION_FILE)
    if not isinstance(expected_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", expected_hash):
        add_error(errors, "package_external_inventory_hash_required", PUBLICATION_FILE)
        return
    if source is None or not source.is_file() or digest(source.read_bytes()) != expected_hash:
        add_error(errors, "package_inventory_hash_mismatch", PUBLICATION_FILE)
        return
    publication = json_object(root, PUBLICATION_FILE, errors)
    if publication is None:
        return
    paths = publication.get("allowlist")
    entries = publication.get("files")
    if (not isinstance(paths, list) or len(paths) != 28 or len(set(paths)) != 28
            or paths != manifest.get("candidateAllowlist") or publication.get("publicationPathCount") != 28
            or publication.get("boundArtifactCount") != 27 or not isinstance(entries, list) or len(entries) != 27):
        add_error(errors, "package_membership_invalid", PUBLICATION_FILE)
        return
    entry_paths = [entry.get("path") if isinstance(entry, dict) else None for entry in entries]
    if set(entry_paths) != set(paths) - {PUBLICATION_FILE} or len(set(entry_paths)) != 27:
        add_error(errors, "package_membership_invalid", PUBLICATION_FILE)
        return
    baseline_paths = set(git_tree_blobs(root, manifest["baselineCommit"]))
    for entry in entries:
        path = entry["path"]
        try:
            artifact_bytes(root, entry)
        except (OSError, ValueError):
            add_error(errors, "package_artifact_mismatch", path)
        if entry.get("publicationClassification") != "PUBLIC_CANDIDATE_REVIEWED_NO_PRIVATE_SOURCE_OR_RAW_SNAPSHOT":
            add_error(errors, "package_publication_classification_invalid", path)
        dependencies = entry.get("dependencies")
        if not isinstance(dependencies, list):
            add_error(errors, "package_dependencies_invalid", path)
            continue
        for dependency in dependencies:
            target = safe_file(root, dependency)
            if dependency not in set(paths) | baseline_paths or target is None or not target.is_file():
                add_error(errors, "package_dependency_missing", path)
    checks["package_artifacts_valid"] = not any(e["code"].startswith("package_") for e in errors)
    checks["package_path_count"] = len(paths)


def approved_additive_locator(root: Path, manifest: dict, baseline: str, relative: str | None, expected_hash: str | None) -> str | None:
    """Verify a separately reviewed locator; never substitute historical inputs."""
    if relative is None and expected_hash is None:
        return None
    source = safe_file(root, relative)
    if source is None or not source.is_file() or not isinstance(expected_hash, str) or digest(source.read_bytes()) != expected_hash:
        raise ValueError("missing/corrupt externally bound successor record")
    record = json.loads(source.read_bytes())
    if (not isinstance(record, dict) or record.get("schemaVersion") != 1 or record.get("kind") != "ADDITIVE_DOCUMENTATION_LOCATOR"
            or record.get("clinicalAuthority") is not False or record.get("legalAuthority") is not False
            or record.get("lifecycleAuthorization") is not False or not isinstance(record.get("bindingId"), str)):
        raise ValueError("invalid successor authority scope")
    integrated = record.get("integrationCommit")
    if not isinstance(integrated, str) or not re.fullmatch(r"[a-f0-9]{40}", integrated):
        raise ValueError("invalid integration identity")
    if git_run(root, ["merge-base", "--is-ancestor", integrated, "HEAD"]).returncode:
        raise ValueError("successor not integrated")
    # The binding is committed separately, so it never hashes its own future commit.
    if git_bytes(root, "show", f"HEAD:{relative}") != source.read_bytes():
        raise ValueError("binding is not integrated unchanged")
    predecessor = record.get("predecessor")
    if not isinstance(predecessor, dict) or normalized_path(predecessor.get("path")) is None:
        raise ValueError("invalid predecessor")
    original = git_bytes(root, "show", f"{baseline}:{predecessor['path']}")
    if len(original) != predecessor.get("bytes") or digest(original) != predecessor.get("sha256"):
        raise ValueError("predecessor identity mismatch")
    successor = record.get("successor")
    approved = record.get("approval")
    body = artifact_bytes(root, successor)
    approval_bytes = artifact_bytes(root, approved)
    target = successor["path"]
    protected = {entry["path"] for entry in manifest["protectedArtifacts"]}
    if (target in protected or target in git_tree_blobs(root, baseline)
            or target.startswith(F011_PATH + "/") or not target.startswith(("docs/", "specs/"))):
        raise ValueError("locator must be additive and non-protected")
    for entry, raw in ((successor, body), (approved, approval_bytes)):
        if git_bytes(root, "show", f"{integrated}:{entry['path']}") != raw:
            raise ValueError("integrated successor/approval differs")
    approval = json.loads(approval_bytes)
    if (not isinstance(approval, dict) or approval.get("decision") != "APPROVED_DOCUMENTATION_SUCCESSOR"
            or approval.get("authority") != "PRODUCT_OWNER_INTERNAL_GOVERNANCE"
            or approval.get("bindingId") != record["bindingId"]
            or approval.get("successorSha256") != successor["sha256"]):
        raise ValueError("missing applicable approval")
    return target


def check_current_documents(root: Path, manifest: dict, baseline: str, locator: str | None, errors: list[dict[str, str]], checks: dict) -> None:
    baseline_paths = set(git_tree_blobs(root, baseline))
    current_paths = set(git_tree_blobs(root, "HEAD")) | git_paths(root, "ls-files", "--others", "--exclude-standard", "-z")
    changed = git_paths(root, "diff", "--name-only", "--no-renames", "-z", baseline, "HEAD", "--")
    changed |= git_paths(root, "diff", "--name-only", "--no-renames", "-z", "HEAD", "--")
    candidates = (current_paths - baseline_paths) | changed
    candidates -= set(manifest.get("candidateAllowlist", []))
    protected = {entry["path"] for entry in manifest["protectedArtifacts"]}
    findings = []
    # A bounded metadata check, not natural-language clinical/legal certification.
    claim = re.compile(r'(?im)^\s*["\']?(?:clinicalApproval|legalApproval|lifecycleAuthorized|normativeAuthority)["\']?\s*:\s*(?:true|approved|effective)\b')
    for path in sorted(candidates):
        if path in protected or path.startswith(F011_PATH + "/") or not is_relevant_tracked(path):
            continue
        findings.append({"path": path, "classification": "APPROVED_ADDITIVE_LOCATOR" if path == locator else "UNCLASSIFIED_NON_PROTECTED", "establishesClinicalLegalOrLifecycleAuthority": False})
        source = safe_file(root, path)
        if source is None:
            add_error(errors, "current_document_path_unsafe", path)
            continue
        if source.is_file() and source.suffix in (".md", ".json"):
            text = source.read_text(encoding="utf-8")
            if claim.search("\n".join(markdown_lines_without_fences(text))):
                add_error(errors, "current_document_unapproved_authority_claim", path)
            if source.suffix == ".md":
                errors.extend(markdown_link_errors(root, path))
    checks["current_document_findings"] = findings
    checks["new_documents_grant_authority"] = False
    checks["future_documents_allowed"] = not any(e["code"].startswith("current_document_") for e in errors)


def verify_root(root: Path, *, mode: str = "current", inventory_sha256: str | None = None,
                baseline_sha256: str = BASELINE_SHA256, successor_binding: str | None = None,
                successor_binding_sha256: str | None = None) -> dict:
    root = root.resolve()
    errors: list[dict[str, str]] = []
    checks: dict[str, object] = {"mode": mode}
    try:
        if mode not in ("package", "current"):
            raise ValueError("unknown validation context")
        pinned = safe_file(root, BASELINE_FILE)
        if pinned is None or not pinned.is_file() or digest(pinned.read_bytes()) != baseline_sha256:
            return {"ok": False, "errors": [{"code": "baseline_authority_binding_mismatch", "path": BASELINE_FILE}], "checks": checks}
        manifest = json_object(root, BASELINE_FILE, errors)
        if manifest is None:
            manifest = {}
        if isinstance(manifest.get("schemaVersion"), bool) or manifest.get("schemaVersion") != 1:
            add_error(errors, "baseline_schema_invalid", BASELINE_FILE)
        commit = check_current_head(root, manifest, errors, checks)
        check_protected_files(root, manifest, commit, errors, checks)
        check_f011(root, manifest, commit, errors, checks)
        if mode == "package":
            check_candidate_diff(root, manifest, commit, errors, checks)
            check_package(root, manifest, inventory_sha256, errors, checks)
        elif commit is not None:
            try:
                locator = approved_additive_locator(root, manifest, commit, successor_binding, successor_binding_sha256)
            except (OSError, RuntimeError, ValueError, KeyError, TypeError):
                locator = None
                add_error(errors, "successor_approval_binding_invalid", successor_binding)
            check_current_documents(root, manifest, commit, locator, errors, checks)
        check_inventory(root, commit, errors, checks, mode=mode)
        check_status_map(root, errors, checks)
        check_agent_configuration(root, errors, checks)
        check_markdown_links(root, errors, checks)
    except (OSError, RuntimeError, UnicodeError, ValueError, KeyError, TypeError):
        add_error(errors, "verification_input_unavailable")
    errors.sort(key=lambda error: (error.get("code", ""), error.get("path", "")))
    return {"ok": not errors, "errors": errors, "checks": checks}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--mode", choices=("package", "current"), default="current")
    parser.add_argument("--inventory-sha256", help="Externally reviewed package inventory SHA-256; required in package mode")
    parser.add_argument("--successor-binding", help="Integrated additive documentation locator record; current mode only")
    parser.add_argument("--successor-binding-sha256", help="Externally approved exact locator-record digest, never inferred from its contents")
    arguments = parser.parse_args(argv)
    if arguments.mode == "package" and (arguments.successor_binding or arguments.successor_binding_sha256):
        parser.error("successor locators cannot widen the exact package")
    report = verify_root(arguments.root, mode=arguments.mode, inventory_sha256=arguments.inventory_sha256,
                         successor_binding=arguments.successor_binding, successor_binding_sha256=arguments.successor_binding_sha256)
    print(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
