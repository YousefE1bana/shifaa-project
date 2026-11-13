import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { git, hostExecutable } from './sandbox.mjs';

// The full profile is executed on a NEW GitHub-hosted VM, not a locally named
// Docker project, worktree or "disposable=true" environment variable.
try {
  assert.equal(process.argv.length, 2, 'No arbitrary workflow/ref overrides');
  const root = resolve(import.meta.dirname, '../..');
  assert.equal(git(root, ['status', '--porcelain']).toString().trim(), '', 'Publish work first');
  git(root, ['fetch', '--no-tags', 'origin']);
  const head = git(root, ['rev-parse', 'HEAD']).toString().trim();
  assert.equal(head, git(root, ['rev-parse', '@{upstream}']).toString().trim(), 'Upstream differs');
  const branch = git(root, ['symbolic-ref', '--short', 'HEAD']).toString().trim();
  assert.match(branch, /^(?:main|codex\/[a-zA-Z0-9._/-]+)$/);
  const actual = git(root, ['ls-remote', 'origin', `refs/heads/${branch}`])
    .toString()
    .split(/\s/)[0];
  assert.equal(actual, head, 'Remote branch differs');
  execFileSync(
    hostExecutable('gh'),
    [
      'workflow',
      'run',
      'verification-comprehensive.yml',
      '--ref',
      branch,
      '-f',
      `expected_sha=${head}`,
    ],
    { cwd: root, stdio: 'inherit' },
  );
  console.log(
    JSON.stringify({
      status: 'DISPATCHED_NOT_VERIFIED',
      commit: head,
      next: 'gh run list --workflow verification-comprehensive.yml; inspect every job and artifact',
    }),
  );
} catch {
  console.error(
    'BLOCKED: comprehensive verification requires a clean published branch, matching upstream, GitHub credentials and the integrated workflow. No local database command was run.',
  );
  process.exitCode = 2;
}
