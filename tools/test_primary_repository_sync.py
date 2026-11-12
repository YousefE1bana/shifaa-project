"""Offline Git fixtures only; never use the real SHIFAA checkout as a fixture.

Requires Git and PowerShell 7 on PATH. Retains small fixtures in the OS temp
directory for failure diagnosis; performs no package, Docker or database work.
"""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


HELPER = Path(__file__).with_name("reconcile-primary-repository.ps1").resolve()
PWSH = shutil.which("pwsh")
GIT = shutil.which("git")


@unittest.skipUnless(PWSH and GIT, "Git and PowerShell 7 are required")
class PrimaryRepositorySyncTests(unittest.TestCase):
    def setUp(self):
        self.fixture = Path(tempfile.mkdtemp(prefix="shifaa-primary-sync-test-")).resolve()
        self.seed = self.fixture / "seed"
        self.remote = self.fixture / "origin.git"
        self.primary = self.fixture / "primary"
        self.env = os.environ.copy()
        self.env.update({"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": str(self.fixture / "empty-gitconfig")})
        self.env.pop("GIT_CONFIG_COUNT", None)
        for name in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"):
            self.env.pop(name, None)
        self.git(self.fixture, "init", "--initial-branch=main", str(self.seed))
        self.git(self.seed, "config", "user.name", "Synthetic fixture")
        self.git(self.seed, "config", "user.email", "fixture@example.invalid")
        (self.seed / "tracked.txt").write_text("approved predecessor\n", encoding="utf-8")
        (self.seed / ".gitignore").write_text("private/\n.specify/feature.json\n", encoding="utf-8")
        self.git(self.seed, "add", "tracked.txt", ".gitignore")
        self.git(self.seed, "commit", "-m", "fixture predecessor")
        self.base = self.git(self.seed, "rev-parse", "HEAD").strip()
        self.git(self.fixture, "init", "--bare", str(self.remote))
        self.git(self.seed, "remote", "add", "origin", str(self.remote))
        self.git(self.seed, "push", "origin", "main")
        self.git(self.fixture, "clone", "--branch", "main", str(self.remote), str(self.primary))
        self.git(self.primary, "config", "user.name", "Synthetic fixture")
        self.git(self.primary, "config", "user.email", "fixture@example.invalid")
        (self.primary / "private").mkdir()
        self.private = self.primary / "private" / "retained.bin"
        self.private.write_bytes(b"synthetic retained data\x00\xff")
        (self.primary / ".specify").mkdir()
        self.pointer = self.primary / ".specify" / "feature.json"
        self.pointer.write_bytes(b'{"feature_directory":"specs/001-synthetic"}\n')
        self.private_hash = self.digest(self.private)
        self.pointer_hash = self.digest(self.pointer)
        (self.seed / "tracked.txt").write_text("approved merged successor\n", encoding="utf-8")
        self.git(self.seed, "add", "tracked.txt")
        self.git(self.seed, "commit", "-m", "fixture merged successor")
        self.target = self.git(self.seed, "rev-parse", "HEAD").strip()
        self.git(self.seed, "push", "origin", "main")

    def git(self, cwd, *args):
        response = subprocess.run([GIT, "-c", "core.longpaths=true", "-C", str(cwd), *args], env=self.env, text=True, capture_output=True, timeout=30)
        self.assertEqual(response.returncode, 0, response.stderr)
        return response.stdout

    @staticmethod
    def digest(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def reconcile(self, *, primary=None, target=None):
        response = subprocess.run([PWSH, "-NoLogo", "-NoProfile", "-File", str(HELPER), "-PrimaryRepository", str(primary or self.primary), "-VerifiedMainCommit", target or self.target, "-PreservePath", "private/retained.bin"], env=self.env, text=True, capture_output=True, timeout=60)
        self.assertTrue(response.stdout.strip(), response.stderr)
        report = json.loads(response.stdout)
        self.assertEqual(response.returncode, {"SYNCED": 0, "ALREADY_SYNCED": 0, "LOCAL_ROOT_SYNC_BLOCKED": 2, "LOCAL_ROOT_SYNC_NOT_VERIFIED": 3}[report["outcome"]], response.stderr)
        self.assertEqual(self.digest(self.private), self.private_hash)
        self.assertEqual(self.digest(self.pointer), self.pointer_hash)
        return report

    def assert_blocked(self, reason):
        before = self.git(self.primary, "rev-parse", "HEAD").strip()
        report = self.reconcile()
        self.assertEqual(report["outcome"], "LOCAL_ROOT_SYNC_BLOCKED", report)
        self.assertIn(reason, report["reason"])
        self.assertEqual(self.git(self.primary, "rev-parse", "HEAD").strip(), before)
        self.assertFalse(report["fastForwardAttempted"])
        return report

    def test_clean_fast_forward_preserves_ignored_bytes_and_pointer(self):
        report = self.reconcile()
        self.assertEqual(report["outcome"], "SYNCED", report)
        self.assertEqual(report["before"]["head"], self.base)
        self.assertEqual(report["after"]["head"], self.target)
        self.assertEqual(report["after"]["originMain"], self.target)
        self.assertEqual(report["after"]["status"], [])
        self.assertEqual((self.primary / "tracked.txt").read_text(), "approved merged successor\n")

    def test_repeated_execution_is_already_synced(self):
        self.assertEqual(self.reconcile()["outcome"], "SYNCED")
        report = self.reconcile()
        self.assertEqual(report["outcome"], "ALREADY_SYNCED", report)
        self.assertFalse(report["fastForwardAttempted"])
        self.assertEqual(report["before"], report["after"])

    def test_tracked_work_is_never_stashed_or_overwritten(self):
        (self.primary / "tracked.txt").write_text("unfinished local work\n")
        self.assert_blocked("Tracked changes")
        self.assertEqual((self.primary / "tracked.txt").read_text(), "unfinished local work\n")

    def test_untracked_work_blocks_without_deletion(self):
        note = self.primary / "unfinished.txt"
        note.write_text("retain me\n")
        self.assert_blocked("untracked files")
        self.assertEqual(note.read_text(), "retain me\n")

    def test_dirty_checkout_at_target_is_not_reported_already_synced(self):
        self.assertEqual(self.reconcile()["outcome"], "SYNCED")
        (self.primary / "tracked.txt").write_text("new unfinished work\n")
        self.assert_blocked("Tracked changes")
        self.assertEqual((self.primary / "tracked.txt").read_text(), "new unfinished work\n")

    def test_divergent_main_is_not_rebased_or_forced(self):
        (self.primary / "local.txt").write_text("independent commit\n")
        self.git(self.primary, "add", "local.txt")
        self.git(self.primary, "commit", "-m", "fixture local divergence")
        self.assert_blocked("divergent")

    def test_detached_checkout_is_not_switched(self):
        self.git(self.primary, "switch", "--detach", self.base)
        self.assert_blocked("detached HEAD")
        self.assertEqual(self.git(self.primary, "branch", "--show-current").strip(), "")

    def test_wrong_branch_is_not_switched(self):
        self.git(self.primary, "switch", "-c", "codex/unfinished")
        self.assert_blocked("not main")
        self.assertEqual(self.git(self.primary, "branch", "--show-current").strip(), "codex/unfinished")

    def test_existing_index_lock_is_retained(self):
        lock = self.primary / ".git" / "index.lock"
        lock.write_bytes(b"synthetic active lock")
        self.assert_blocked("index.lock")
        self.assertEqual(lock.read_bytes(), b"synthetic active lock")

    def test_ignored_incoming_collision_is_not_overwritten(self):
        (self.seed / "private").mkdir()
        (self.seed / "private" / "retained.bin").write_bytes(b"remote replacement")
        self.git(self.seed, "add", "-f", "private/retained.bin")
        self.git(self.seed, "commit", "-m", "fixture incoming collision")
        self.target = self.git(self.seed, "rev-parse", "HEAD").strip()
        self.git(self.seed, "push", "origin", "main")
        self.assert_blocked("collides")

    def test_verified_commit_drift_does_not_sync_to_unreviewed_main(self):
        report = self.reconcile(target=self.base)
        self.assertEqual(report["outcome"], "LOCAL_ROOT_SYNC_BLOCKED", report)
        self.assertIn("differs", report["reason"])
        self.assertEqual(self.git(self.primary, "rev-parse", "HEAD").strip(), self.base)

    def test_local_main_ahead_of_origin_is_not_moved_backwards(self):
        self.assertEqual(self.reconcile()["outcome"], "SYNCED")
        (self.primary / "local.txt").write_text("not yet published\n")
        self.git(self.primary, "add", "local.txt")
        self.git(self.primary, "commit", "-m", "fixture local main ahead")
        self.assert_blocked("ahead")

    def test_missing_filesystem_reports_not_verified(self):
        report = self.reconcile(primary=self.fixture / "absent")
        self.assertEqual(report["outcome"], "LOCAL_ROOT_SYNC_NOT_VERIFIED", report)

    def test_missing_upstream_is_not_repaired_implicitly(self):
        self.git(self.primary, "branch", "--unset-upstream")
        self.assert_blocked("does not track")

    def test_linked_worktree_cannot_substitute_for_primary(self):
        linked = self.fixture / "linked"
        self.git(self.primary, "worktree", "add", "-b", "codex/linked", str(linked), self.base)
        report = self.reconcile(primary=linked)
        self.assertEqual(report["outcome"], "LOCAL_ROOT_SYNC_BLOCKED", report)
        self.assertIn("linked worktree", report["reason"])

    def test_unreachable_remote_preserves_checkout(self):
        self.git(self.primary, "remote", "set-url", "origin", str(self.fixture / "missing-origin.git"))
        self.assert_blocked("Fetch failed")


if __name__ == "__main__":
    unittest.main(verbosity=2)
