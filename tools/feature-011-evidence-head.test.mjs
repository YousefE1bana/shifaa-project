import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { evidenceHeadBelongsToCurrentHistory } from './feature-011-evidence-head.mjs';

test('captured evidence survives a recording commit but rejects a foreign history', () => {
  const parent = resolve('artifacts/feature-011/pr-remediation/head-fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'fixture-'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  try {
    git('init', '-q');
    git('config', 'user.name', 'Synthetic evidence fixture');
    git('config', 'user.email', 'synthetic@example.invalid');
    git('commit', '--allow-empty', '-qm', 'captured source');
    const baseline = git('rev-parse', 'HEAD');
    git('checkout', '-qb', 'feature');
    git('commit', '--allow-empty', '-qm', 'tested feature');
    const captured = git('rev-parse', 'HEAD');
    assert.equal(evidenceHeadBelongsToCurrentHistory(root, captured), true);
    git('commit', '--allow-empty', '-qm', 'record verified evidence');
    assert.equal(evidenceHeadBelongsToCurrentHistory(root, captured), true);
    git('checkout', '-qb', 'integrated', baseline);
    git('commit', '--allow-empty', '-qm', 'squash integrated feature');
    const authorizedCapture = { head: captured, baseline };
    assert.equal(evidenceHeadBelongsToCurrentHistory(root, captured), false);
    assert.equal(evidenceHeadBelongsToCurrentHistory(root, captured, authorizedCapture), true);
    assert.equal(evidenceHeadBelongsToCurrentHistory(root, baseline, authorizedCapture), false);
    git('checkout', '--orphan', 'foreign');
    git('commit', '--allow-empty', '-qm', 'unrelated source');
    assert.equal(evidenceHeadBelongsToCurrentHistory(root, captured), false);
    assert.equal(evidenceHeadBelongsToCurrentHistory(root, captured, authorizedCapture), false);
    assert.equal(evidenceHeadBelongsToCurrentHistory(root, '--all'), false);
  } finally {
    rmSync(root, { recursive: true });
  }
});
