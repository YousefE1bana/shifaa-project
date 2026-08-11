import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const source = fs.readFileSync(
  new URL('../src/app/facility-governance/GovernanceWorkspace.tsx', import.meta.url),
  'utf8',
);
test('governance UI exposes minimum projection, AAL2, purpose, and independent actor copy', () => {
  for (const token of [
    'minimum necessary projection',
    'AAL2',
    'valid purpose',
    'independent from the proposer',
    'Propose grant',
    'Independent grant decision',
    'Propose revocation',
    'Independent revocation decision',
    'revocation-pending',
    'self-denied',
    'conflict',
  ])
    assert.match(source, new RegExp(token, 'i'));
});
