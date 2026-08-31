import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('../src/app/relationships/GuardianshipWorkspace.tsx', import.meta.url),
  'utf8',
);

test('guardianship worklist is minimum, AAL2, purpose-bound, independent, and versioned', () => {
  for (const token of [
    'accessToken?: () => string | undefined',
    'listGuardianshipCases',
    'reviewGuardianship',
    "'X-AAL': '2'",
    "'X-Purpose': 'guardianship_review'",
    'evidence_status',
    'approved_permissions',
    'valid_until',
    'version',
    'self-denied',
    'conflict',
  ])
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const forbidden of [
    'object_key',
    'evidence_path',
    'national_id',
    'phone_e164',
    'diagnosis',
    'invitation_token',
  ])
    assert.doesNotMatch(source, new RegExp(forbidden, 'i'));
  assert.doesNotMatch(source, /synthetic-admin:support_admin:/);
});

test('guardianship page has Arabic and English parity plus accessible live state and targets', () => {
  for (const token of ["'ar-EG'", "'en-EG'", 'dir=', 'aria-live', 'minHeight: 44', 'minHeight: 48'])
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /document\.documentElement\.lang = locale/);
  assert.match(source, /document\.documentElement\.dir = locale === 'ar-EG' \? 'rtl' : 'ltr'/);
});
