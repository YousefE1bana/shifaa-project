from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import speckit_tooling as tooling

ROOT = Path(__file__).resolve().parents[1]


def write_json(root, name, value):
    file = root / name
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")


def tooling_fixture(root):
    for path in (*tooling.METADATA_PATHS, tooling.SOURCE_PATH, ".specify/workflows/workflow-registry.json"):
        write_json(root, path, json.loads((ROOT / path).read_bytes()))
    for integration in ("codex", "speckit"):
        path = f".specify/integrations/{integration}.manifest.json"
        data = json.loads((root / path).read_bytes())
        file = ".agents/skills/speckit-example/SKILL.md" if integration == "codex" else ".specify/scripts/powershell/common.ps1"
        target = root / file
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"reviewed managed source\n")
        data["files"] = {file: hashlib.sha256(target.read_bytes()).hexdigest()}
        write_json(root, path, data)


def set_version(root, version):
    for path in (*tooling.METADATA_PATHS, tooling.SOURCE_PATH):
        value = json.loads((root / path).read_bytes())
        value["speckit_version" if path.endswith("init-options.json") else "version"] = version
        if path == tooling.SOURCE_PATH:
            value["tag"] = "v" + version
            value["release"] = "https://github.com/github/spec-kit/releases/tag/v" + version
        write_json(root, path, value)


class ToolingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        tooling_fixture(self.root)

    def test_future_stable_releases_need_no_canonical_or_feature_edit(self):
        canonical = [ROOT / ".specify/memory/constitution.md", ROOT / "SHIFAA-Implementation-Plan-MASTER.md",
                     ROOT / "tools/verify-discovery-sos-evidence.mjs"]
        before = [path.read_bytes() for path in canonical]
        for version in ("1.2.0", "1.2.1", "1.3.0", "2.0.0"):
            with self.subTest(version=version):
                set_version(self.root, version)
                report = tooling.validate_configuration(self.root, require_runtime=True)
                self.assertEqual(report["version"], version)
                self.assertFalse(report["clinicalAuthority"])
                self.assertFalse(report["lifecycleAuthorized"])
        self.assertEqual(before, [path.read_bytes() for path in canonical])

    def test_schema_identity_managed_source_and_workflow_negatives(self):
        cases = [
            (".specify/integration.json", lambda d: d.update(version="latest")),
            (".specify/integration.json", lambda d: d.update(integration_state_schema=True)),
            (".specify/integration.json", lambda d: d.update(installed_integrations=["codex", "kimi"])),
            (".specify/integration.json", lambda d: d["integration_settings"]["codex"].update(script="bash")),
            (".specify/init-options.json", lambda d: d.update(speckit_version="9.0.0")),
            (tooling.SOURCE_PATH, lambda d: d.update(repository="https://example.invalid/spec-kit.git")),
            (tooling.SOURCE_PATH, lambda d: d.update(commit="not-a-commit")),
            (tooling.SOURCE_PATH, lambda d: d.update(tag="v9.0.0")),
            (".specify/integrations/codex.manifest.json", lambda d: d.update(version="9.0.0")),
            (".specify/integrations/speckit.manifest.json", lambda d: d.update(files={"../escape": "0" * 64})),
            (".specify/workflows/workflow-registry.json", lambda d: d["workflows"]["speckit"].update(version="9.0.0")),
        ]
        for path, change in cases:
            with self.subTest(path=path):
                original = (self.root / path).read_bytes()
                try:
                    value = json.loads(original)
                    change(value)
                    write_json(self.root, path, value)
                    with self.assertRaises(ValueError):
                        tooling.validate_configuration(self.root)
                finally:
                    (self.root / path).write_bytes(original)

    def test_missing_corrupted_managed_body_never_passes(self):
        target = self.root / ".specify/scripts/powershell/common.ps1"
        target.write_bytes(b"corruption\n")
        with self.assertRaisesRegex(ValueError, "source drift"):
            tooling.validate_configuration(self.root)
        target.unlink()
        with self.assertRaises(OSError):
            tooling.validate_configuration(self.root)

    def test_missing_local_skills_are_reported_and_runtime_validation_rejects(self):
        (self.root / ".agents/skills/speckit-example/SKILL.md").unlink()
        self.assertEqual(len(tooling.validate_configuration(self.root)["missingLocalSkills"]), 1)
        with self.assertRaises(OSError):
            tooling.validate_configuration(self.root, require_runtime=True)

    def test_duplicate_keys_and_crlf_are_rejected(self):
        target = self.root / ".specify/integration.json"
        for raw in (b'{"version":"1.2.0","version":"2.0.0"}', b'{\r\n"version":"1.2.0"\r\n}'):
            target.write_bytes(raw)
            with self.assertRaises(ValueError):
                tooling.validate_configuration(self.root)

    def test_numeric_boolean_substitution_is_rejected(self):
        for path, mutate in (
            (".specify/init-options.json", lambda d: d.update(ai_skills=1)),
            (".specify/integration.json", lambda d: d["integration_settings"]["codex"]["parsed_options"].update(skills=1)),
        ):
            target = self.root / path
            raw = target.read_bytes()
            data = json.loads(raw)
            mutate(data)
            write_json(self.root, path, data)
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, "boolean"):
                tooling.validate_configuration(self.root)
            target.write_bytes(raw)

    def test_traversal_and_links_rejected_without_writing_outside_fixture(self):
        for path in ("../outside", "/absolute", "C:/absolute", "a/../b", "a\\b", "a//b"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                tooling.safe_path(self.root, path)
        target = self.root / ".specify/tooling-source.json"
        original = target.read_bytes()
        target.unlink()
        sibling = self.root / "sibling.json"
        sibling.write_bytes(original)
        try:
            target.symlink_to(sibling)
        except OSError:
            self.skipTest("Symlink creation not supported by this test account")
        with self.assertRaisesRegex(ValueError, "linked"):
            tooling.validate_configuration(self.root)

    def test_installed_version_and_origin_must_match(self):
        source = json.loads((self.root / tooling.SOURCE_PATH).read_bytes())
        installed = {"version": "1.2.0", "origin": {"url": tooling.UPSTREAM, "vcs_info": {"commit_id": source["commit"]}}}
        for kind in ("valid", "version", "origin", "commit"):
            value = json.loads(json.dumps(installed))
            if kind == "version": value["version"] = "1.1.3"
            if kind == "origin": value["origin"]["url"] = "https://example.invalid"
            if kind == "commit": value["origin"]["vcs_info"]["commit_id"] = "0" * 40
            with self.subTest(kind=kind), patch("subprocess.run", return_value=subprocess.CompletedProcess([], 0, json.dumps(value))) as boundary:
                if kind == "valid":
                    self.assertEqual(tooling.verify_installation("fixture-python", "1.2.0", source["commit"]), value)
                else:
                    with self.assertRaises(ValueError): tooling.verify_installation("fixture-python", "1.2.0", source["commit"])
                self.assertEqual(boundary.call_count, 1)

    def test_official_upstream_resolution_rejects_substituted_commit(self):
        source = json.loads((self.root / tooling.SOURCE_PATH).read_bytes())
        for commit in (source["commit"], "0" * 40):
            with self.subTest(commit=commit), patch("subprocess.run", return_value=subprocess.CompletedProcess([], 0, f"{commit}\trefs/tags/v1.2.0^{{}}\n")):
                if commit == source["commit"]: tooling.verify_upstream(source)
                else:
                    with self.assertRaises(ValueError): tooling.verify_upstream(source)

    def test_feature006_bridge_propagates_current_validation_and_rejects_failure(self):
        source = (ROOT / "tools/verify-discovery-sos-evidence.mjs").read_text()
        snippet = source.split("// SHIFAA-SPECKIT-PIN-BOUNDARY START")[1].split("// SHIFAA-SPECKIT-PIN-BOUNDARY END")[0]
        # Evaluate only the pure bridge, never the surrounding evidence/Docker script.
        program = """const {join}=require('node:path'); const assert=require('node:assert/strict');
const bridge=new Function('execFileSync','join',JSON.parse(process.argv[1]).replace('export function','function')+'; return verifySpecKitPin;')(()=>{throw Error('unexpected default execution')},join);
for(const version of ['1.2.0','1.2.1','1.3.0']) {
 const result=bridge('fixture-root',(exe,args)=>{assert.ok(args[0].endsWith('speckit_tooling.py')); assert.deepEqual(args.slice(1),['--root','fixture-root']); return JSON.stringify({ok:true,checks:{version}})},{});
 assert.equal(result.checks.version,version);
}
assert.throws(()=>bridge('fixture-root',()=>JSON.stringify({ok:false}),{}));
assert.throws(()=>bridge('fixture-root',()=>{throw Error('validation unavailable')},{}));
"""
        completed = subprocess.run(["node", "-e", program, json.dumps(snippet)], capture_output=True)
        self.assertEqual(completed.returncode, 0, completed.stderr.decode())

    def test_lf_metadata_roundtrip_uses_only_disposable_index(self):
        import hashlib
        def git(*args, data=None):
            return subprocess.run(["git", *args], cwd=self.root, input=data,
                                  capture_output=True, check=True).stdout
        git("init", "-q")
        (self.root / ".gitattributes").write_bytes(b"* text=auto eol=lf\n")
        for path in sorted(tooling.METADATA_PATHS):
            raw = (self.root / path).read_bytes()
            self.assertNotIn(b"\r", raw)
            git("add", "--", path)
            blob = git("rev-parse", ":" + path).decode().strip()
            self.assertEqual(git("cat-file", "blob", blob), raw)
            self.assertEqual(git("hash-object", "--stdin", data=raw).decode().strip(), blob)
            self.assertEqual(git("cat-file", "--filters", ":" + path), raw)
            self.assertEqual(hashlib.sha256(git("cat-file", "blob", blob)).digest(), hashlib.sha256(raw).digest())

    def test_one_time_policy_history_is_exact_and_has_no_metadata_version_gate(self):
        import tooling_history
        import shutil
        record = json.loads((ROOT / tooling_history.RECORD).read_bytes())
        self.assertFalse(set(tooling.METADATA_PATHS) & {item["path"] for item in record["inputs"]})
        target = self.root / tooling_history.RECORD
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((ROOT / tooling_history.RECORD).read_bytes())
        for item in record["inputs"]:
            output = self.root / item["path"]
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / item["path"], output)
        gitdir = subprocess.run(["git", "rev-parse", "--absolute-git-dir"], cwd=ROOT,
                                capture_output=True, check=True).stdout.decode().strip()
        (self.root / ".git").write_text("gitdir: " + gitdir + "\n")
        def node_projection(expected_success):
            code = "const m=await import(process.argv[1]); console.log(m.toolingPolicyHistoricalInputs(process.argv[2]).size);"
            result = subprocess.run(["node", "--input-type=module", "-e", code,
                                     (ROOT / "tools/tooling-history.mjs").as_uri(), str(self.root)], capture_output=True)
            self.assertEqual(result.returncode == 0, expected_success, result.stderr.decode())
            return result.stdout.strip()
        original = tooling_history.preserved_inputs(self.root)
        self.assertEqual(len(original), 4)
        self.assertEqual(node_projection(True), b"4")
        for item in record["inputs"]:
            path = self.root / item["path"]
            raw = path.read_bytes()
            path.write_bytes(raw + b"unapproved")
            with self.subTest(path=item["path"]), self.assertRaisesRegex(ValueError, "source drift"):
                tooling_history.preserved_inputs(self.root)
            node_projection(False)
            path.write_bytes(raw)
        target.write_bytes(target.read_bytes() + b" ")
        with self.assertRaisesRegex(ValueError, "record changed"):
            tooling_history.preserved_inputs(self.root)
        node_projection(False)
        target.unlink()
        self.assertEqual(tooling_history.preserved_inputs(self.root), {})
        self.assertEqual(node_projection(True), b"0")


if __name__ == "__main__":
    unittest.main()
