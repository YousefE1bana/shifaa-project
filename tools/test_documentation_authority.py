from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path


TOOL_PATH = Path(__file__).with_name("verify-documentation-authority.py")
SPEC = importlib.util.spec_from_file_location("documentation_authority", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
authority = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(authority)


def run_git(root: Path, *arguments: str) -> bytes:
    completed = subprocess.run(
        ["git", "-c", "core.longpaths=true", *arguments],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return completed.stdout


def write_text(root: Path, relative: str, text: str) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8", newline="")


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, indent=2) + "\n").encode("utf-8")


class AuthorityVerifierTests(unittest.TestCase):
    def make_repository(self, *, tooling=False) -> tuple[tempfile.TemporaryDirectory, Path]:
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        contents = {
            "AGENTS.md": "# Instructions\n\n[Authority](docs/governance/SHIFAA-Current-Authority-Map-v1.md#current-authority)\n",
            "docs/agent-skills/README.md": "# Agent skills\n",
            "docs/SHIFAA-Operational-Guide-v1.md": "# Operations\n",
            "docs/SHIFAA-Documentation-Index.md": "# Documentation\n\n[Authority](governance/SHIFAA-Current-Authority-Map-v1.md#current-authority)\n",
            "docs/governance/SHIFAA-Current-Authority-Map-v1.md": "# Current authority\n\n## Current authority\n",
            "docs/governance/repository-modernization-v1/overview.md": "# Overview\n\n[Index](../../SHIFAA-Documentation-Index.md)\n",
            "docs/protected.md": "sealed bytes\n",
            "docs/old-history-note.md": "Historical documentation, not a protected artifact\n",
            "specs/012-example/contract-amendment/approved.md": "PR496 protected fixture\n",
            "specs/011-allergies-clinical-content-governance/frozen.md": "F011 historical bytes\n",
            ".shifaa/skills/shifaa-project-guardrails/SKILL.md": "# Project\n\n[Map](../../../docs/governance/SHIFAA-Current-Authority-Map-v1.md)\n",
            ".shifaa/skills/shifaa-ui-governor/SKILL.md": "# UI\n",
            ".shifaa/skills/shifaa-third-party-skill-overlay/SKILL.md": "# Overlay\n",
            ".shifaa/skills/shifaa-speckit-overlay/SKILL.md": "# SpecKit\n",
        }
        if tooling:
            import sys
            sys.path.insert(0, str(TOOL_PATH.parent))
            from test_speckit_tooling import tooling_fixture
            tooling_fixture(root)
            for relative in authority.METADATA_PATHS:
                contents[relative] = (root / relative).read_text(encoding="utf-8")
        for relative, text in contents.items():
            write_text(root, relative, text)
        write_text(root, ".gitignore", "ignored.tmp\n")
        write_text(root, ".codex/config.toml", self.config_text())
        for role in authority.ROLE_NAMES:
            write_text(root, f".codex/agents/{role}.toml", 'model = "gpt-6-luna"\n')
        run_git(root, "init", "-q")
        run_git(root, "config", "user.name", "Fixture Author")
        run_git(root, "config", "user.email", "fixture@example.invalid")
        run_git(root, "add", "-A")
        run_git(root, "commit", "-m", "fixture baseline")
        commit = run_git(root, "rev-parse", "HEAD").decode().strip()
        baseline_blobs = authority.git_tree_blobs(root, commit)
        baseline_contents = authority.git_blob_contents(root, set(baseline_blobs.values()))
        f011_path = authority.F011_PATH
        f011_tree = run_git(root, "rev-parse", f"{commit}:{f011_path}").decode().strip()
        f011_files = run_git(root, "ls-tree", "-r", "--name-only", "-z", commit, "--", f"{f011_path}/").split(b"\0")
        manifest = {
            "schemaVersion": 1,
            "baselineCommit": commit,
            "protectedArtifacts": [
                {"path": path, "bytes": len(baseline_contents[baseline_blobs[path]]),
                 "sha256": hashlib.sha256(baseline_contents[baseline_blobs[path]]).hexdigest(),
                 "gitBlob": baseline_blobs[path]}
                for path in ("docs/protected.md", "specs/012-example/contract-amendment/approved.md", *(authority.METADATA_PATHS if tooling else []))
            ],
            "f011": {"path": f011_path, "files": len([path for path in f011_files if path]), "gitTree": f011_tree},
            "candidateAllowlist": [
                *authority.REQUIRED_MARKDOWN,
                ".codex/config.toml",
                *[f".codex/{relative}" for relative in authority.ROLE_FILES.values()],
                authority.BASELINE_FILE, authority.STATUS_FILE, authority.INVENTORY_FILE, authority.PUBLICATION_FILE,
                "tools/verify-documentation-authority.py",
                "tools/test_documentation_authority.py",
                "docs/governance/repository-modernization-v1/overview.md",
                *[f"docs/package-note-{number}.md" for number in range(6)],
            ],
        }
        write_text(root, authority.BASELINE_FILE, json_bytes(manifest).decode())
        status = {
            "schemaVersion": 1,
            "operationAccounting": authority.EXPECTED_ACCOUNTING,
            "lifecycleAuthorized": False,
            "clinicalApproval": False,
        }
        write_text(root, authority.STATUS_FILE, json_bytes(status).decode())
        inventory_lines = []
        for relative, object_id in baseline_blobs.items():
            if not authority.is_relevant_tracked(relative):
                continue
            raw = baseline_contents[object_id]
            inventory_lines.append(
                {
                    "path": relative,
                    "classification": "HISTORICAL_IMMUTABLE" if relative == "docs/old-history-note.md" else "CURRENT_CANONICAL",
                    "owner": "fixture",
                    "authorityCommit": commit,
                    "version": "1",
                    "source": "fixture baseline",
                    "issue": "none",
                    "impact": "fixture",
                    "protection": "fixture",
                    "recommendedAction": "retain",
                    "bytes": len(raw),
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "gitBlob": object_id,
                }
            )
        write_text(root, authority.INVENTORY_FILE, "".join(json.dumps(entry, sort_keys=True) + "\n" for entry in inventory_lines))
        for path in manifest["candidateAllowlist"]:
            if path != authority.PUBLICATION_FILE and not (root / path).exists():
                write_text(root, path, "# Package fixture\n")
        entries = []
        for path in manifest["candidateAllowlist"]:
            if path == authority.PUBLICATION_FILE:
                continue
            raw = (root / path).read_bytes()
            entries.append({"path": path, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
                            "publicationClassification": "PUBLIC_CANDIDATE_REVIEWED_NO_PRIVATE_SOURCE_OR_RAW_SNAPSHOT",
                            "dependencies": [authority.BASELINE_FILE]})
        publication = {"allowlist": manifest["candidateAllowlist"], "files": entries,
                       "publicationPathCount": 28, "boundArtifactCount": 27}
        write_text(root, authority.PUBLICATION_FILE, json_bytes(publication).decode())
        if not hasattr(self, "anchors"):
            self.anchors = {}
        self.anchors[str(root)] = {
            "baseline_sha256": hashlib.sha256((root / authority.BASELINE_FILE).read_bytes()).hexdigest(),
            "inventory_sha256": hashlib.sha256((root / authority.PUBLICATION_FILE).read_bytes()).hexdigest(),
        }
        return temporary, root

    def verify(self, root: Path, *, mode="package", **kwargs) -> dict:
        # Fixture trust anchors are captured before mutations, not recalculated to pass.
        return authority.verify_root(root, mode=mode, **self.anchors[str(root)], **kwargs)

    @staticmethod
    def config_text() -> str:
        text = '[agents]\nenabled = true\nmax_concurrent_threads_per_session = 2\n'
        for role in authority.ROLE_NAMES:
            text += f'\n[agents.{role}]\nconfig_file = "agents/{role}.toml"\n'
        return text + '\n[features.multi_agent_v2]\nmax_concurrent_threads_per_session = 2\n'

    def verify_fixture(self, mutate=None) -> tuple[tempfile.TemporaryDirectory, Path, dict]:
        temporary, root = self.make_repository()
        if mutate is not None:
            mutate(root)
        return temporary, root, self.verify(root)

    def test_complete_fixture_passes_read_only_candidate_checks(self):
        temporary, root = self.make_repository()
        try:
            write_text(root, "ignored.tmp", "ignored candidate")
            report = self.verify(root)
            self.assertTrue(report["ok"], report["errors"])
            self.assertEqual(report["checks"]["candidate_diff_allowed"], True)
            self.assertEqual(report["checks"]["inventory_tracked_count"], report["checks"]["inventory_coverage_count"])
            self.assertEqual(report["checks"]["package_path_count"], 28)
            for kind in ("modified", "missing", "no_external_pin", "corrupted_inventory"):
                with self.subTest(kind=kind):
                    target = root / "docs/package-note-0.md"
                    original = target.read_bytes()
                    inventory = root / authority.PUBLICATION_FILE
                    original_inventory = inventory.read_bytes()
                    if kind == "modified":
                        target.write_bytes(b"unapproved package edit\n")
                    elif kind == "missing":
                        target.unlink()
                    elif kind == "corrupted_inventory":
                        inventory.write_bytes(original_inventory + b" ")
                    try:
                        if kind == "no_external_pin":
                            invalid = authority.verify_root(root, mode="package", baseline_sha256=self.anchors[str(root)]["baseline_sha256"])
                            expected = "package_external_inventory_hash_required"
                        else:
                            invalid = self.verify(root)
                            expected = "package_inventory_hash_mismatch" if kind == "corrupted_inventory" else "package_artifact_mismatch"
                        self.assertIn(expected, {e["code"] for e in invalid["errors"]})
                    finally:
                        target.write_bytes(original)
                        inventory.write_bytes(original_inventory)
        finally:
            temporary.cleanup()

    def test_baseline_remains_valid_after_an_allowlisted_candidate_commit(self):
        temporary, root = self.make_repository()
        try:
            run_git(root, "add", "-A")
            run_git(root, "commit", "-m", "fixture modernization integrated")
            future = "specs/012-prescription-safety-governed-overrides/spec.md"
            write_text(root, future, "# Authorized future engineering specification\n\nNo clinical clearance.\n")
            for committed in (False, True):
                with self.subTest(committed=committed):
                    if committed:
                        run_git(root, "add", future)
                        run_git(root, "commit", "-m", "fixture future specification")
                    report = self.verify(root, mode="current")
                    self.assertTrue(report["ok"], report["errors"])
                    self.assertTrue(report["checks"]["protected_artifacts"])
                    finding = next(x for x in report["checks"]["current_document_findings"] if x["path"] == future)
                    self.assertEqual(finding["classification"], "UNCLASSIFIED_NON_PROTECTED")
                    self.assertFalse(finding["establishesClinicalLegalOrLifecycleAuthority"])
                    self.assertIn("candidate_path_not_allowlisted", {e["code"] for e in self.verify(root)["errors"]})
            # A historical inventory classification alone is not an immutable-byte grant.
            write_text(root, "docs/old-history-note.md", "# Authorized current operational successor\n")
            self.assertTrue(self.verify(root, mode="current")["ok"])
            (root / "docs/old-history-note.md").unlink()
            self.assertTrue(self.verify(root, mode="current")["ok"])
        finally:
            temporary.cleanup()

    def test_markdown_link_check_reads_fences_and_duplicate_heading_anchors_without_writing(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_text(root, "target.md", "one\ntwo\n")
            write_text(root, "guide.md", "# Setup\n\n## Repeat\n\n## Repeat\n\n[second](#repeat-1)\n\n[query and line](target.md?view=1#L2)\n\n[project root](/target.md)\n\n```md\n[ignored](missing.md)\n```\n")
            before = sorted(path.relative_to(root).as_posix() for path in root.rglob("*"))
            self.assertEqual(authority.markdown_link_errors(root, "guide.md"), [])
            after = sorted(path.relative_to(root).as_posix() for path in root.rglob("*"))
            self.assertEqual(before, after)
            write_text(root, "guide.md", "[missing](absent.md)\n")
            self.assertEqual(authority.markdown_link_errors(root, "guide.md")[0]["code"], "markdown_link_target_missing")

    def test_changed_protected_bytes_fail_the_historical_digest_check(self):
        for path in ("docs/protected.md", "specs/012-example/contract-amendment/approved.md"):
            temporary, root = self.make_repository()
            try:
                write_text(root, path, "changed normative or PR496 fixture bytes\n")
                for mode in ("package", "current"):
                    with self.subTest(path=path, mode=mode):
                        codes = {e["code"] for e in self.verify(root, mode=mode)["errors"]}
                        self.assertIn("protected_current_hash_mismatch", codes)
                        self.assertIn("protected_current_differs_from_history", codes)
            finally:
                temporary.cleanup()

    def test_unallowlisted_candidate_file_is_rejected(self):
        def add_file(root: Path) -> None:
            write_text(root, "unrelated.txt", "candidate")

        temporary, _root, report = self.verify_fixture(add_file)
        try:
            self.assertIn("candidate_path_not_allowlisted", {error["code"] for error in report["errors"]})
        finally:
            temporary.cleanup()

    def test_role_path_traversal_and_closed_role_set_are_rejected(self):
        for mutation, expected in (
            (lambda root: write_text(root, ".codex/config.toml", self.config_text().replace('agents/explorer.toml', '../../outside.toml')), "agent_role_config_mapping_mismatch"),
            (lambda root: write_text(root, ".codex/config.toml", self.config_text().replace('[agents.ui-worker]\nconfig_file = "agents/ui-worker.toml"\n', "")), "agent_role_set_mismatch"),
        ):
            with self.subTest(expected=expected):
                temporary, _root, report = self.verify_fixture(mutation)
                try:
                    self.assertIn(expected, {error["code"] for error in report["errors"]})
                finally:
                    temporary.cleanup()

    def test_inventory_missing_path_and_unapproved_classification_are_rejected(self):
        for field, replacement, expected in (
            ("path", "docs/missing.md", "inventory_file_missing"),
            ("classification", "MADE_UP", "inventory_classification_invalid"),
        ):
            def mutate(root: Path) -> None:
                inventory = root / authority.INVENTORY_FILE
                rows = [json.loads(line) for line in inventory.read_text(encoding="utf-8").splitlines()]
                rows[0][field] = replacement
                inventory.write_text("".join(json.dumps(row, sort_keys=True) + "\n" for row in rows), encoding="utf-8")

            with self.subTest(field=field):
                temporary, _root, report = self.verify_fixture(mutate)
                try:
                    self.assertIn(expected, {error["code"] for error in report["errors"]})
                finally:
                    temporary.cleanup()

    def test_operation_accounting_mismatch_is_rejected(self):
        def mutate(root: Path) -> None:
            status = json.loads((root / authority.STATUS_FILE).read_text(encoding="utf-8"))
            status["operationAccounting"]["F012"] = 10
            (root / authority.STATUS_FILE).write_bytes(json_bytes(status))

        temporary, _root, report = self.verify_fixture(mutate)
        try:
            self.assertIn("feature_operation_accounting_mismatch", {error["code"] for error in report["errors"]})
        finally:
            temporary.cleanup()


    def test_missing_protected_source_fails_closed(self):
        temporary, root = self.make_repository()
        try:
            (root / "docs/protected.md").unlink()
            report = self.verify(root)
            self.assertIn("protected_current_missing", {error["code"] for error in report["errors"]})
            for mode in ("package", "current"):
                baseline = root / authority.BASELINE_FILE
                original = baseline.read_bytes()
                try:
                    baseline.write_bytes(original + b" ")
                    self.assertIn("baseline_authority_binding_mismatch", {e["code"] for e in self.verify(root, mode=mode)["errors"]})
                finally:
                    baseline.write_bytes(original)
        finally:
            temporary.cleanup()

    def test_duplicate_inventory_path_and_missing_coverage_are_rejected(self):
        temporary, root = self.make_repository()
        try:
            path = root / authority.INVENTORY_FILE
            rows = path.read_text(encoding="utf8").splitlines()
            path.write_text("\n".join([rows[0], *rows[:-1]]) + "\n", encoding="utf8")
            codes = {error["code"] for error in self.verify(root)["errors"]}
            self.assertIn("inventory_path_duplicate", codes)
            self.assertIn("inventory_tracked_path_missing", codes)
        finally:
            temporary.cleanup()

    def test_false_lifecycle_or_clinical_authority_is_rejected(self):
        for key, code in (("lifecycleAuthorized", "feature_lifecycle_must_remain_unauthorized"),
                          ("clinicalApproval", "feature_clinical_approval_must_remain_false")):
            temporary, root = self.make_repository()
            try:
                path = root / authority.STATUS_FILE
                data = json.loads(path.read_text(encoding="utf8"))
                data[key] = True
                path.write_bytes(json_bytes(data))
                self.assertIn(code, {error["code"] for error in self.verify(root)["errors"]})
            finally:
                temporary.cleanup()
        for key in ("clinicalApproval", "legalApproval", "lifecycleAuthorized", "normativeAuthority"):
            temporary, root = self.make_repository()
            try:
                write_text(root, "specs/012-example/claimed-authority.md", f"---\n{key}: true\n---\n# Unapproved claim\n")
                report = self.verify(root, mode="current")
                self.assertIn("current_document_unapproved_authority_claim", {e["code"] for e in report["errors"]})
            finally:
                temporary.cleanup()

    def test_changed_f011_input_is_not_hidden_by_successor_lookup(self):
        temporary, root = self.make_repository()
        try:
            write_text(root, authority.F011_PATH + "/frozen.md", "unapproved clinical source\n")
            for mode in ("package", "current"):
                self.assertIn("f011_tracked_files_changed", {error["code"] for error in self.verify(root, mode=mode)["errors"]})
        finally:
            temporary.cleanup()

    def test_verifier_preserves_actual_index_and_pointer_bytes(self):
        temporary, root = self.make_repository()
        try:
            for mode in ("package", "current"):
                with self.subTest(mode=mode):
                    write_text(root, ".specify/feature.json", '{"feature":"do-not-change"}\n')
                    # Explicitly ignored machine-local pointer, as in SHIFAA.
                    write_text(root, ".git/info/exclude", ".specify/feature.json\n")
                    before = {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob("*") if p.is_file()}
                    report = self.verify(root, mode=mode)
                    after = {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob("*") if p.is_file()}
                    self.assertTrue(report["ok"], report["errors"])
                    self.assertEqual(before, after)
            self.exercise_successor_bindings(root)
        finally:
            temporary.cleanup()

    def exercise_successor_bindings(self, root: Path) -> None:
        """Synthetic approval fixtures; never professional or repository approval."""
        target = "docs/future-authorized-successor-v2.md"
        approval_path = "docs/future-approval-fixture.json"
        binding_path = "docs/future-binding-fixture.json"
        binding_id = "FIXTURE-DOCUMENTATION/2.0.0"
        write_text(root, target, "# Approved additive documentation fixture\n")
        approval = {"decision": "APPROVED_DOCUMENTATION_SUCCESSOR", "authority": "PRODUCT_OWNER_INTERNAL_GOVERNANCE",
                    "bindingId": binding_id, "successorSha256": hashlib.sha256((root / target).read_bytes()).hexdigest()}
        write_text(root, approval_path, json_bytes(approval).decode())
        run_git(root, "add", "-A")
        run_git(root, "commit", "-m", "fixture additive doc and approval integrated")
        integrated = run_git(root, "rev-parse", "HEAD").decode().strip()
        def descriptor(path):
            raw = (root / path).read_bytes()
            return {"path": path, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
        record = {"schemaVersion": 1, "bindingId": binding_id, "kind": "ADDITIVE_DOCUMENTATION_LOCATOR",
                  "clinicalAuthority": False, "legalAuthority": False, "lifecycleAuthorization": False,
                  "integrationCommit": integrated, "predecessor": descriptor("docs/protected.md"),
                  "successor": descriptor(target), "approval": descriptor(approval_path)}
        raw_record = json_bytes(record)
        write_text(root, binding_path, raw_record.decode())
        run_git(root, "add", binding_path)
        run_git(root, "commit", "-m", "fixture external hash-bound binding integrated")
        kwargs = {"mode": "current", "successor_binding": binding_path,
                  "successor_binding_sha256": hashlib.sha256(raw_record).hexdigest()}
        before_index = (root / ".git/index").read_bytes()
        positive = self.verify(root, **kwargs)
        self.assertTrue(positive["ok"], positive["errors"])
        finding = next(x for x in positive["checks"]["current_document_findings"] if x["path"] == target)
        self.assertEqual(finding["classification"], "APPROVED_ADDITIVE_LOCATOR")
        self.assertTrue(positive["checks"]["f011_unchanged"])
        for path, changed in ((binding_path, b"corrupt binding"), (approval_path, None),
                              (approval_path, b"unapproved or corrupt approval"), (target, b"altered successor")):
            original = (root / path).read_bytes()
            with self.subTest(successor_mutation=path, changed=changed):
                try:
                    if changed is None:
                        (root / path).unlink()
                    else:
                        (root / path).write_bytes(changed)
                    self.assertIn("successor_approval_binding_invalid", {e["code"] for e in self.verify(root, **kwargs)["errors"]})
                finally:
                    (root / path).write_bytes(original)
        invalid_pin = dict(kwargs, successor_binding_sha256="0" * 64)
        self.assertIn("successor_approval_binding_invalid", {e["code"] for e in self.verify(root, **invalid_pin)["errors"]})
        self.assertEqual(before_index, (root / ".git/index").read_bytes())


class MutableToolingTests(unittest.TestCase):
    make_repository = AuthorityVerifierTests.make_repository
    verify = AuthorityVerifierTests.verify
    config_text = staticmethod(AuthorityVerifierTests.config_text)
    def test_future_patch_and_minor_change_only_mutable_configuration(self):
        from test_speckit_tooling import set_version
        temporary, root = self.make_repository(tooling=True)
        try:
            baseline = (root / authority.BASELINE_FILE).read_bytes()
            for version in ("1.2.1", "1.3.0"):
                set_version(root, version)
                report = self.verify(root, mode="current")
                self.assertTrue(report["ok"], report["errors"])
                self.assertEqual(report["checks"]["mutable_tooling"]["version"], version)
                self.assertEqual((root / authority.BASELINE_FILE).read_bytes(), baseline)
                self.assertIn("protected_current_hash_mismatch", {e["code"] for e in self.verify(root)["errors"]})
            write_text(root, "docs/protected.md", "unapproved historical mutation")
            self.assertIn("protected_current_hash_mismatch", {e["code"] for e in self.verify(root, mode="current")["errors"]})
        finally:
            temporary.cleanup()

    def test_mutable_file_corruption_is_not_hidden_by_history(self):
        temporary, root = self.make_repository(tooling=True)
        try:
            path = root / ".specify/integration.json"
            data = json.loads(path.read_bytes())
            data["integration_settings"]["codex"]["script"] = "bash"
            path.write_bytes(json_bytes(data))
            report = self.verify(root, mode="current")
            self.assertIn("mutable_tooling_configuration_invalid", {e["code"] for e in report["errors"]})
        finally:
            temporary.cleanup()

if __name__ == "__main__":
    unittest.main()
