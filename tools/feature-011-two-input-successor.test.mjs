import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { currentEvidenceRoot, verifyFeature011Contracts } from './verify-feature-011-contracts.mjs';
import { readHistoricalVerificationInputs } from './feature-011-constitution-successor.mjs';
import {
  readTwoInputDocumentationSuccessor,
  twoInputBindingPath,
} from './feature-011-two-input-successor.mjs';

const source = resolve(import.meta.dirname, '..');
const feature = 'specs/012-prescription-safety-governed-overrides';
const inventory = `${feature}/contract-amendment/publication-inventory.json`;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'shifaa-pr496-successor-test-'));
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: source })
    .toString()
    .split('\0')
    .filter(Boolean);
  for (const file of [...files, twoInputBindingPath, 'tools/feature-011-two-input-successor.mjs']) {
    if (
      !/^(specs\/(?:001|010|011|012)-|tools\/|docs\/|infra\/db\/|supabase\/|packages\/|services\/|\.specify\/|\.github\/|package.json$|compose.yml$|shifaa-prd.md$|SHIFAA-Implementation-Plan-MASTER.md$)/.test(
        file,
      )
    )
      continue;
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(source, file), join(root, file));
  }
  // Read immutable objects from the existing repository; no fixture writes to Git.
  const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: source })
    .toString()
    .trim();
  writeFileSync(join(root, '.git'), `gitdir: ${gitDir}\n`);
  return root;
}

test('PR496 exact two-input compatibility preserves mandatory historical evidence and denies drift', async (t) => {
  const root = fixtureRoot();
  const evidence = currentEvidenceRoot(root);
  await t.test(
    'approved appendices project exact original bytes without clinical or lifecycle authority',
    async () => {
      const report = await verifyFeature011Contracts({ root });
      assert.equal(report.result, 'PASS', report.failures.join('\n'));
      assert.equal(report.mode, 'FULL_PARITY_EVIDENCE');
      assert.deepEqual(report.requiredStages, ['P1', 'P2', 'P3', 'P4', 'P5']);
      assert.equal(report.retainedGate, 'OPEN-TECH-002');
      assert.equal(report.governanceSuccessor.clinicalAuthority, false);
      assert.equal(report.governanceSuccessor.effective, false);
      const binding = JSON.parse(readFileSync(join(root, twoInputBindingPath)));
      assert.equal(binding.lifecycleAuthorization, false);
      assert.equal(binding.contractActivation, false);
      const read = readHistoricalVerificationInputs(root);
      for (const input of binding.inputs) {
        assert.equal(sha(read(input.path)), input.historical.sha256);
        assert.equal(sha(readFileSync(join(root, input.path))), input.sha256);
      }
    },
  );
  const catalog = 'docs/architecture/SHIFAA-API-Catalog.md';
  const data = 'docs/architecture/SHIFAA-Data-RLS.md';
  const proof = JSON.parse(readFileSync(join(root, `${evidence}/physical-green.json`)));
  const altered = (bytes) => Buffer.concat([bytes, Buffer.from('\nUNAPPROVED DRIFT\n')]);
  const prefixEdit = (token) => (bytes) => {
    const changed = Buffer.from(bytes);
    const at = changed.indexOf(token);
    assert.ok(at >= 0);
    changed[at] = changed[at] === 88 ? 89 : 88;
    return changed;
  };
  const jsonEdit = (edit) => (bytes) => {
    const record = JSON.parse(bytes);
    edit(record);
    return Buffer.from(JSON.stringify(record));
  };
  const binding = JSON.parse(readFileSync(join(root, twoInputBindingPath)));
  const cases = [
    ['changed F011 Catalog operation row', catalog, prefixEdit('listAllergies')],
    ['changed historical Data/RLS prefix', data, prefixEdit('clinical.')],
    ...binding.inputs.flatMap((input) => [
      [
        `modified appendix ${input.path}`,
        input.path,
        (bytes) => {
          const changed = Buffer.from(bytes);
          changed[input.historical.bytes + 30] ^= 1;
          return changed;
        },
      ],
      [
        `removed appendix ${input.path}`,
        input.path,
        (bytes) => bytes.subarray(0, input.historical.bytes),
      ],
      [`extended appendix ${input.path}`, input.path, altered],
    ]),
    ['missing versioned approval', twoInputBindingPath, null],
    ['corrupt versioned approval', twoInputBindingPath, altered],
    ['missing approved inventory', inventory, null],
    ['mismatched approved inventory', inventory, altered],
    [
      'missing boundary approval',
      `${feature}/decisions/reviewer-boundary-approval-2026-10-16.md`,
      null,
    ],
    [
      'corrupted exact contract',
      `${feature}/contract-amendment/reviewer-contract-v0.1.0.md`,
      altered,
    ],
    [
      'unapproved historical-reader tooling',
      'tools/feature-011-constitution-successor.mjs',
      altered,
    ],
    ['unapproved previously pinned verifier', 'tools/verify-feature-011-contracts.mjs', altered],
    [
      'unauthorized clinical-content consumption',
      'specs/011-allergies-clinical-content-governance/contracts/verified-evidence-binding-parity-v1.json',
      jsonEdit((record) => {
        record.consumptionAllowed = true;
      }),
    ],
    [
      'original F011 approval modified',
      'specs/011-allergies-clinical-content-governance/decisions/recovered-plan-approval-manifest-v1.json',
      altered,
    ],
    ['unrelated normative input changed', 'docs/design/SHIFAA-UI-Contract.md', altered],
    ['generated output changed', 'packages/contracts/src/feature-011.ts', altered],
    ['physical input changed', 'infra/db/tests/feature-011-schema.sql', altered],
    ['missing actual P4 proof', `${evidence}/physical-green.json`, null],
    [
      'stale P4 source binding',
      `${evidence}/physical-green.json`,
      jsonEdit((record) => {
        record.sourceDigests[catalog] = '0'.repeat(64);
      }),
    ],
    ['missing actual P5 disposition', `${evidence}/stage-assertion.json`, null],
    [
      'stale P5 source binding',
      `${evidence}/stage-assertion.json`,
      jsonEdit((record) => {
        record.sourceDigests[data] = '0'.repeat(64);
      }),
    ],
    ['missing physical execution artifact', proof.runtimes[0].execution.path, null],
    [
      'unauthorized protected-content permission',
      data,
      (bytes) =>
        Buffer.concat([
          bytes,
          Buffer.from('\nPermit F012 access to protected F011 clinical rule bodies.\n'),
        ]),
    ],
    [
      'premature clinical/lifecycle activation',
      twoInputBindingPath,
      jsonEdit((record) => {
        record.clinicalAuthority = true;
        record.lifecycleAuthorization = true;
        record.contractActivation = true;
      }),
    ],
    [
      'original Constitution binding corrupted',
      `${feature}/decisions/f011-constitution-successor-v1.json`,
      altered,
    ],
  ];
  for (const [name, file, mutation] of cases) {
    await t.test(`rejects ${name}`, async () => {
      const target = join(root, file);
      assert.ok(existsSync(target), file);
      const original = readFileSync(target);
      try {
        if (mutation) writeFileSync(target, mutation(original));
        else unlinkSync(target);
        const report = await verifyFeature011Contracts({ root });
        assert.equal(report.result, 'FAIL', name);
        assert.ok(report.failures.length > 0);
        assert.equal(report.affectedConsumersAllowed, false);
        assert.equal(report.physicalParity, 'PENDING');
        assert.deepEqual(report.requiredStages, ['P1', 'P2', 'P3', 'P4', 'P5']);
      } finally {
        // Restore only bytes created for this disposable fixture, never repository files.
        writeFileSync(target, original);
      }
    });
  }
  await t.test('missing binding never authorizes a projection even for original documents', () => {
    const originals = new Map();
    const target = join(root, twoInputBindingPath);
    const approved = readFileSync(target);
    try {
      for (const input of binding.inputs) {
        originals.set(input.path, readFileSync(join(root, input.path)));
        writeFileSync(
          join(root, input.path),
          execFileSync('git', ['cat-file', 'blob', input.historical.blob], { cwd: source }),
        );
      }
      unlinkSync(target);
      assert.equal(readTwoInputDocumentationSuccessor(root).size, 0);
    } finally {
      for (const [file, bytes] of originals) writeFileSync(join(root, file), bytes);
      writeFileSync(target, approved);
    }
  });
  assert.equal((await verifyFeature011Contracts({ root })).result, 'PASS');
});
