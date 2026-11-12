"""PR #509 regression: real files/Git objects; no database, Docker or network."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import tooling_history as history

ROOT = Path(__file__).resolve().parents[1]


class HistoricalReaderSuccessorTests(unittest.TestCase):
    def setUp(self):
        parent = ROOT / "artifacts/feature-011/history-reader-fixtures"
        parent.mkdir(parents=True, exist_ok=True)
        temporary = tempfile.TemporaryDirectory(prefix="python-", dir=parent)
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.record = json.loads((ROOT / history.RECORD).read_bytes())
        self.binding = json.loads((ROOT / history.APPENDIX_SUCCESSOR).read_bytes())
        paths = {history.RECORD, history.APPENDIX_SUCCESSOR}
        paths.update(item["path"] for item in self.record["inputs"] + self.binding["inputs"])
        for name in paths:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        gitdir = subprocess.check_output(["git", "rev-parse", "--absolute-git-dir"], cwd=ROOT).decode().strip()
        (self.root / ".git").write_text("gitdir: " + gitdir + "\n")

    def blob(self, descriptor):
        return subprocess.check_output(["git", "cat-file", "blob", descriptor["gitBlob"]], cwd=ROOT)

    def test_approved_appendices_preserve_all_original_projections(self):
        projected = history.preserved_inputs(self.root)
        expected_paths = {item["path"] for item in self.record["inputs"] + self.binding["inputs"]}
        self.assertEqual(set(projected), expected_paths)
        for item in self.record["inputs"]:
            with self.subTest(original=item["path"]):
                self.assertEqual(projected[item["path"]], self.blob(item["historical"]))
        for item in self.binding["inputs"]:
            if item["path"] not in {old["path"] for old in self.record["inputs"]}:
                with self.subTest(predecessor=item["path"]):
                    self.assertEqual(projected[item["path"]], self.blob(item["predecessor"]))

    def test_edits_truncations_and_arbitrary_appendices_fail_after_a_successful_read(self):
        history.preserved_inputs(self.root)
        for item in self.binding["inputs"]:
            path = self.root / item["path"]
            current = path.read_bytes()
            boundary = item["appendix"]["offset"]
            prefix_edit = bytes([current[0] ^ 1]) + current[1:]
            appendix_edit = current[:boundary] + bytes([current[boundary] ^ 1]) + current[boundary + 1:]
            for changed in (prefix_edit, appendix_edit, current[:boundary], current[:-1], current + b"\nUNAUTHORIZED\n"):
                with self.subTest(path=item["path"], mutation_sha256=hashlib.sha256(changed).hexdigest()):
                    path.write_bytes(changed)
                    with self.assertRaisesRegex(ValueError, "successor source drift"):
                        history.preserved_inputs(self.root)
            path.write_bytes(current)

    def test_successor_binding_cannot_redefine_its_boundary_hash_or_scope(self):
        history.preserved_inputs(self.root)
        path = self.root / history.APPENDIX_SUCCESSOR
        raw = path.read_bytes()
        changed = json.loads(raw)
        changed["inputs"][0]["appendix"]["offset"] -= 1
        changed["inputs"][0]["successor"]["sha256"] = "0" * 64
        changed["inputs"].append({"path": "unauthorized.md"})
        for mutation in (raw + b" ", json.dumps(changed).encode()):
            path.write_bytes(mutation)
            with self.assertRaisesRegex(ValueError, "binding drift"):
                history.preserved_inputs(self.root)
        path.unlink()
        with self.assertRaisesRegex(ValueError, "source drift"):
            history.preserved_inputs(self.root)

    def test_legacy_inputs_need_no_successor_and_old_record_stays_immutable(self):
        (self.root / history.APPENDIX_SUCCESSOR).unlink()
        for item in self.binding["inputs"]:
            (self.root / item["path"]).write_bytes(self.blob(item["predecessor"]))
        projected = history.preserved_inputs(self.root)
        self.assertEqual(set(projected), {item["path"] for item in self.record["inputs"]})
        for item in self.record["inputs"]:
            self.assertEqual(projected[item["path"]], self.blob(item["historical"]))
        path = self.root / history.RECORD
        path.write_bytes(path.read_bytes() + b" ")
        with self.assertRaisesRegex(ValueError, "record changed"):
            history.preserved_inputs(self.root)


if __name__ == "__main__":
    unittest.main()
