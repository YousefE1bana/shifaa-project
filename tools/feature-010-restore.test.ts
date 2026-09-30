import assert from 'node:assert/strict';
import { test } from 'node:test';

async function boundary() {
  const module = await import('./run-feature-010-restore-test.mjs').catch((error) => {
    if (
      error.code === 'ERR_MODULE_NOT_FOUND' &&
      error.message.includes('run-feature-010-restore-test.mjs')
    )
      return undefined;
    throw error;
  });
  assert.equal(
    typeof module?.verifyRestoreProof,
    'function',
    'C28_MISSING_RESTORE_VERIFIER: actual restored data/security evidence must be validated',
  );
  return module!;
}

const proof = () => ({
  source: {
    dataDigest: 'a'.repeat(32),
    securityDigest: 'b'.repeat(32),
    counts: {
      appointments: 5,
      queue: 1,
      encounters: 2,
      signedNotes: 4,
      corrections: 2,
      acceptedReferrals: 1,
      messages: 1,
      outbox: 8,
      responses: 8,
      f009Appointments: 1,
      f009QueueEntries: 1,
      f009Schedules: 1,
      f009BlockedExceptions: 1,
      f009AuditEvents: 1,
      f009Idempotency: 1,
    },
    relationshipsValid: true,
    f009Compatible: true,
  },
  restored: {
    dataDigest: 'a'.repeat(32),
    securityDigest: 'b'.repeat(32),
    counts: {
      appointments: 5,
      queue: 1,
      encounters: 2,
      signedNotes: 4,
      corrections: 2,
      acceptedReferrals: 1,
      messages: 1,
      outbox: 8,
      responses: 8,
      f009Appointments: 1,
      f009QueueEntries: 1,
      f009Schedules: 1,
      f009BlockedExceptions: 1,
      f009AuditEvents: 1,
      f009Idempotency: 1,
    },
    relationshipsValid: true,
    f009Compatible: true,
  },
  backupBytes: 8000,
  restoreMs: 2000,
  authorizationChecks: [
    'authorized-read',
    'foreign-denied',
    'ended-denied',
    'completed-denied',
    'direct-table-denied',
    'c26-update-ordering',
    'c26-note-ordering',
    'c26-complete-ordering',
    'c26-referral-create-ordering',
    'c26-referral-accept-ordering',
  ],
  migrationHead: '20260930001001_f010_c26_privacy_guards.sql',
  forwardUpgrade: 'C23-to-C26-populated-data-preserved',
  changedC26Functions: [
    'clinical.accept_referral_api_v1',
    'clinical.complete_encounter_api_v1',
    'clinical.create_referral_api_v1',
    'clinical.sign_encounter_note_api_v1',
    'clinical.update_encounter_api_v1',
  ],
  apiCompatibility: 'PASS',
  apiCompatibilityChecks: {
    authorizedDecryption: 'PASS',
    signedCorrectionLink: 'PASS',
    privateNoteFiltering: 'PASS',
    foreignDenied: 'PASS',
  },
  c26RestoredReplay: 'PASS',
});

test('actual restore proof retains data, history, security and local-only classification', async () => {
  const { verifyRestoreProof } = await boundary();
  assert.equal(
    verifyRestoreProof(proof()).productionAvailability,
    'UNAVAILABLE-AS-PRODUCTION-EVIDENCE',
  );
});

test('restore cannot pass when rows, relationships, permissions or authorization evidence are missing', async () => {
  const { verifyRestoreProof } = await boundary();
  for (const change of [
    (p: ReturnType<typeof proof>) => {
      p.restored.dataDigest = 'c'.repeat(32);
    },
    (p: ReturnType<typeof proof>) => {
      p.restored.securityDigest = 'c'.repeat(32);
    },
    (p: ReturnType<typeof proof>) => {
      p.source.counts.corrections = p.restored.counts.corrections = 0;
    },
    (p: ReturnType<typeof proof>) => {
      p.restored.relationshipsValid = false;
    },
    (p: ReturnType<typeof proof>) => {
      p.restored.f009Compatible = false;
    },
    (p: ReturnType<typeof proof>) => {
      p.restored.counts.f009Idempotency = 0;
    },
    (p: ReturnType<typeof proof>) => {
      p.authorizationChecks = [];
    },
    (p: ReturnType<typeof proof>) => {
      p.backupBytes = 0;
    },
    (p: ReturnType<typeof proof>) => {
      p.restoreMs = Number.NaN;
    },
    (p: ReturnType<typeof proof>) => {
      p.migrationHead = 'pre-C26.sql';
    },
    (p: ReturnType<typeof proof>) => {
      p.changedC26Functions.pop();
    },
    (p: ReturnType<typeof proof>) => {
      p.apiCompatibilityChecks.privateNoteFiltering = 'FAIL';
    },
  ]) {
    const candidate = proof();
    change(candidate);
    assert.throws(() => verifyRestoreProof(candidate));
  }
});

test('forward replay applies only pending immutable migrations and rejects drift or holes', async () => {
  const { pendingForwardMigrations } = await boundary();
  const manifest = [
    { path: 'base.sql', digest: 'a' },
    { path: 'c23.sql', digest: 'b' },
    { path: 'c26.sql', digest: 'c' },
  ];
  assert.deepEqual(pendingForwardMigrations(manifest, []), manifest);
  assert.deepEqual(pendingForwardMigrations(manifest, manifest.slice(0, 1)), manifest.slice(1));
  assert.deepEqual(pendingForwardMigrations(manifest, manifest), []);
  assert.deepEqual(pendingForwardMigrations(manifest, manifest.slice(0, 2), 2), []);
  assert.deepEqual(pendingForwardMigrations(manifest, manifest.slice(0, 2)), manifest.slice(2));
  assert.throws(() =>
    pendingForwardMigrations(manifest, [{ path: 'base.sql', digest: 'changed' }]),
  );
  assert.throws(() => pendingForwardMigrations(manifest, manifest.slice(1)));
  assert.throws(() => pendingForwardMigrations(manifest, manifest, 2));
});

const c26Functions = [
  'clinical.update_encounter_api_v1(uuid,integer,jsonb)',
  'clinical.sign_encounter_note_api_v1(uuid,jsonb)',
  'clinical.complete_encounter_api_v1(uuid,integer,jsonb)',
  'clinical.create_referral_api_v1(uuid,jsonb)',
  'clinical.accept_referral_api_v1(uuid,integer,jsonb)',
];

function forwardUpgradeSnapshots() {
  const before = {
    dataDigest: 'a'.repeat(32),
    securityDigest: 'b'.repeat(32),
    counts: {
      signedNotes: 3,
      corrections: 1,
      acceptedReferrals: 1,
      messages: 1,
      f009QueueEntries: 1,
    },
    relationshipsValid: true,
    f009Compatible: true,
    tableDigests: { 'clinical.encounters': 'a' },
    constraintDigests: { 'clinical.encounters.encounter_status_check': 'b' },
    triggerDigests: { 'clinical.encounters.encounter_updated_at': 'c' },
    policyDigests: { 'clinical.encounters.encounters_select': 'd' },
    functionDigests: Object.fromEntries([
      ...c26Functions.map((key) => [key, 'before']),
      ['clinical.feature_010_get_encounter_projection_v1(uuid)', 'unchanged'],
    ]),
  };
  const after = structuredClone(before);
  after.securityDigest = 'c'.repeat(32);
  for (const key of c26Functions) after.functionDigests[key] = 'after';
  return { before, after };
}

test('populated C23-to-C26 upgrade preserves rows and changes exactly the five C26 functions', async () => {
  const { verifyForwardUpgrade } = await boundary();
  const { before, after } = forwardUpgradeSnapshots();
  assert.deepEqual(
    verifyForwardUpgrade(before, after).sort(),
    c26Functions.map((key) => key.slice(0, key.indexOf('('))).sort(),
  );
});

test('forward upgrade proof rejects partial C26 restatement and non-C26 or data changes', async () => {
  const { verifyForwardUpgrade } = await boundary();
  const failures = [
    (
      before: ReturnType<typeof forwardUpgradeSnapshots>['before'],
      after: ReturnType<typeof forwardUpgradeSnapshots>['after'],
    ) => {
      after.functionDigests[c26Functions[1]!] = before.functionDigests[c26Functions[1]!]!;
    },
    (
      before: ReturnType<typeof forwardUpgradeSnapshots>['before'],
      after: ReturnType<typeof forwardUpgradeSnapshots>['after'],
    ) => {
      after.functionDigests['clinical.feature_010_get_encounter_projection_v1(uuid)'] = 'changed';
    },
    (
      _before: ReturnType<typeof forwardUpgradeSnapshots>['before'],
      after: ReturnType<typeof forwardUpgradeSnapshots>['after'],
    ) => {
      after.dataDigest = 'd'.repeat(32);
    },
    (
      _before: ReturnType<typeof forwardUpgradeSnapshots>['before'],
      after: ReturnType<typeof forwardUpgradeSnapshots>['after'],
    ) => {
      after.policyDigests['clinical.encounters.encounters_select'] = 'changed';
    },
  ];
  for (const change of failures) {
    const { before, after } = forwardUpgradeSnapshots();
    change(before, after);
    assert.throws(() => verifyForwardUpgrade(before, after));
  }
});
