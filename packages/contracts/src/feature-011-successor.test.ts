import { describe, expect, it } from 'vitest';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const constitution = '.specify/memory/constitution.md';
const feature = 'specs/012-prescription-safety-governed-overrides';
const binding = `${feature}/decisions/f011-constitution-successor-v1.json`;
const approval = `${feature}/decisions/graduation-governance-approval.md`;
const sourceManifest = `${feature}/readiness/real-medicine-research/source-manifest.json`;
const originalManifest =
  'specs/011-allergies-clinical-content-governance/decisions/recovered-plan-approval-manifest-v1.json';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const successor = await import(
  pathToFileURL(path.join(root, 'tools/feature-011-documentation-successor.mjs')).href
);

function fixture(run: (fixtureRoot: string) => void) {
  const parent = path.join(root, 'artifacts/feature-011');
  fs.mkdirSync(parent, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(parent, 'constitution-successor-'));
  const paths = [
    constitution,
    originalManifest,
    ...successor.constitutionSuccessorInputPaths,
    'tools/feature-011-documentation-successor.mjs',
    'tools/generate-feature-011-contract.mjs',
    'tools/verify-feature-011-contracts.mjs',
  ];
  try {
    for (const file of paths) {
      const target = path.join(fixtureRoot, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, file), target);
    }
    run(fixtureRoot);
  } finally {
    expect(path.dirname(path.resolve(fixtureRoot))).toBe(parent);
    expect(path.basename(fixtureRoot)).toMatch(/^constitution-successor-/);
    fs.rmSync(fixtureRoot, { recursive: true });
  }
}

describe('F011 historical Constitution and conditional successor compatibility', () => {
  it('preserves the historical binding when the exact conditional successor is approved', async () => {
    const { readFeature011ProtocolMetadata } = await import(
      pathToFileURL(path.join(root, 'tools/generate-feature-011-contract.mjs')).href
    );
    const metadata = readFeature011ProtocolMetadata(root);
    expect(metadata.normativeInputDigests['.specify/memory/constitution.md']).toBe(
      '25419aa07eca0c7846a80acb9720e3f4041c0970cd78025fbf1107bae659c30a',
    );
    expect(metadata.consumptionAllowed).toBe(false);
  });

  it('checks the current successor separately from immutable historical evidence', () => {
    const status = successor.readConstitutionSuccessor(root);
    expect(status.constitutionSha256).toBe(
      'cc0204a2fcef7ee6e337fada07c160def4a7b51915ced944951cf0c8a1828a44',
    );
    expect(sha(successor.readHistoricalVerificationInputs(root)(constitution))).toBe(
      '25419aa07eca0c7846a80acb9720e3f4041c0970cd78025fbf1107bae659c30a',
    );
    expect(status.effective).toBe(false);
    expect(status.clinicalAuthority).toBe(false);
    expect(status.activation).toBe('SEPARATELY_AUTHORIZED_PR_B_REQUIRED');
  });

  it('continues to accept the unchanged original binding without a successor', () => {
    fixture((directory) => {
      const original = execFileSync(
        'git',
        ['show', `862db9f66c19ccb8efa9163e5221845225b62174:${constitution}`],
        { cwd: root },
      );
      fs.writeFileSync(path.join(directory, constitution), original);
      fs.unlinkSync(path.join(directory, binding));
      expect(successor.readConstitutionSuccessor(directory)).toBe(null);
      expect(successor.readHistoricalVerificationInputs(directory)(constitution)).toEqual(original);
    });
  });

  it.each([
    ['corrupted Constitution', constitution, 'append', /Constitution successor drift/],
    ['missing approval', approval, 'remove', /ENOENT/],
    ['unapproved decision', approval, 'append', /owner approval drift/],
    ['missing binding', binding, 'remove', /ENOENT/],
    ['corrupted binding', binding, 'append', /successor binding drift/],
    ['corrupted release manifest', sourceManifest, 'append', /Release binding drift/],
    ['changed F011 approval', originalManifest, 'append', /Original F011 approval/],
    ['unapproved tooling', 'tools/generate-feature-011-contract.mjs', 'append', /tooling drift/],
  ])('fails closed for %s', (_label, file, action, expected) => {
    fixture((directory) => {
      const target = path.join(directory, file as string);
      if (action === 'remove') fs.unlinkSync(target);
      else fs.appendFileSync(target, '\nUNAPPROVED');
      expect(() => successor.readHistoricalVerificationInputs(directory)).toThrow(
        expected as RegExp,
      );
    });
  });

  it('rejects premature activation in the versioned binding', () => {
    fixture((directory) => {
      const target = path.join(directory, binding);
      const record = JSON.parse(fs.readFileSync(target, 'utf8'));
      record.effective = true;
      fs.writeFileSync(target, JSON.stringify(record));
      expect(() => successor.readConstitutionSuccessor(directory)).toThrow(/binding drift/);
    });
  });

  it('does not turn an unverified activation receipt into effective authority', () => {
    fixture((directory) => {
      fs.writeFileSync(
        path.join(directory, feature, 'decisions/activation-receipt.json'),
        JSON.stringify({ effective: true, approved: true }),
      );
      expect(successor.readConstitutionSuccessor(directory).effective).toBe(false);
    });
  });

  it('does not substitute historical bytes for unrelated normative inputs', () => {
    fixture((directory) => {
      expect(successor.readHistoricalVerificationInputs(directory)(originalManifest)).toEqual(
        fs.readFileSync(path.join(directory, originalManifest)),
      );
    });
  });
});
