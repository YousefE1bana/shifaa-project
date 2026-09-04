type FixtureDecision = 'allow' | 'deny' | 'not_applicable';

export type AuditAdminAuthorizationFixture = {
  scenario: string;
  actorPersonId: string | null;
  role: string | null;
  dpoDesignated: boolean;
  grant: 'current' | 'stale' | 'revoked' | 'none';
  aal: 1 | 2 | null;
  factorAgeSeconds: number | null;
  purpose: string | null;
  auditRead: FixtureDecision;
  adminExport: FixtureDecision;
  internalExport: FixtureDecision;
  healthProbe: FixtureDecision;
};

const deniedUserFixture = {
  dpoDesignated: false,
  grant: 'none',
  aal: 1,
  factorAgeSeconds: null,
  purpose: null,
  auditRead: 'deny',
  adminExport: 'deny',
  internalExport: 'deny',
  healthProbe: 'deny',
} as const;

export const auditAdminAuthorizationFixtures = [
  { scenario: 'unauthenticated', actorPersonId: null, role: null, ...deniedUserFixture },
  {
    scenario: 'patient',
    actorPersonId: '81000000-0000-4000-8000-000000000001',
    role: 'patient',
    ...deniedUserFixture,
  },
  {
    scenario: 'guardian_or_delegate',
    actorPersonId: '81000000-0000-4000-8000-000000000002',
    role: 'care_relationship_holder',
    ...deniedUserFixture,
  },
  {
    scenario: 'workforce',
    actorPersonId: '81000000-0000-4000-8000-000000000003',
    role: 'workforce',
    ...deniedUserFixture,
  },
  {
    scenario: 'support_admin',
    actorPersonId: '81000000-0000-4000-8000-000000000004',
    role: 'support_admin',
    ...deniedUserFixture,
  },
  {
    scenario: 'medical_reviewer',
    actorPersonId: '81000000-0000-4000-8000-000000000005',
    role: 'medical_reviewer',
    ...deniedUserFixture,
  },
  {
    scenario: 'facility_approver',
    actorPersonId: '81000000-0000-4000-8000-000000000006',
    role: 'facility_approver',
    ...deniedUserFixture,
  },
  {
    scenario: 'finance_reviewer',
    actorPersonId: '81000000-0000-4000-8000-000000000007',
    role: 'finance_reviewer',
    ...deniedUserFixture,
  },
  {
    scenario: 'dpo_only',
    actorPersonId: '81000000-0000-4000-8000-000000000008',
    role: null,
    ...deniedUserFixture,
    dpoDesignated: true,
  },
  {
    scenario: 'stale_super_admin',
    actorPersonId: '81000000-0000-4000-8000-000000000009',
    role: 'super_admin',
    ...deniedUserFixture,
    grant: 'stale',
    aal: 2,
    factorAgeSeconds: 60,
    purpose: 'security.audit.review',
  },
  {
    scenario: 'revoked_super_admin',
    actorPersonId: '81000000-0000-4000-8000-000000000015',
    role: 'super_admin',
    ...deniedUserFixture,
    grant: 'revoked',
    aal: 2,
    factorAgeSeconds: 60,
    purpose: 'security.audit.review',
  },
  {
    scenario: 'super_admin_aal1',
    actorPersonId: '81000000-0000-4000-8000-000000000010',
    role: 'super_admin',
    ...deniedUserFixture,
    grant: 'current',
    purpose: 'security.audit.review',
  },
  {
    scenario: 'super_admin_stale_aal2',
    actorPersonId: '81000000-0000-4000-8000-000000000011',
    role: 'super_admin',
    ...deniedUserFixture,
    grant: 'current',
    aal: 2,
    factorAgeSeconds: 301,
    purpose: 'security.audit.review',
  },
  {
    scenario: 'super_admin_missing_purpose',
    actorPersonId: '81000000-0000-4000-8000-000000000012',
    role: 'super_admin',
    ...deniedUserFixture,
    grant: 'current',
    aal: 2,
    factorAgeSeconds: 300,
  },
  {
    scenario: 'super_admin_wrong_purpose',
    actorPersonId: '81000000-0000-4000-8000-000000000013',
    role: 'super_admin',
    ...deniedUserFixture,
    grant: 'current',
    aal: 2,
    factorAgeSeconds: 300,
    purpose: 'unapproved.purpose',
  },
  {
    scenario: 'super_admin_current_aal2_purpose',
    actorPersonId: '81000000-0000-4000-8000-000000000014',
    role: 'super_admin',
    dpoDesignated: false,
    grant: 'current',
    aal: 2,
    factorAgeSeconds: 300,
    purpose: 'security.audit.review',
    auditRead: 'allow',
    adminExport: 'allow',
    internalExport: 'deny',
    healthProbe: 'deny',
  },
  {
    scenario: 'export_worker_service',
    actorPersonId: null,
    role: 'shifaa_worker',
    dpoDesignated: false,
    grant: 'none',
    aal: null,
    factorAgeSeconds: null,
    purpose: null,
    auditRead: 'not_applicable',
    adminExport: 'not_applicable',
    internalExport: 'allow',
    healthProbe: 'deny',
  },
  {
    scenario: 'platform_probe_service',
    actorPersonId: null,
    role: 'platform_probe',
    dpoDesignated: false,
    grant: 'none',
    aal: null,
    factorAgeSeconds: null,
    purpose: null,
    auditRead: 'not_applicable',
    adminExport: 'not_applicable',
    internalExport: 'deny',
    healthProbe: 'allow',
  },
] as const satisfies readonly AuditAdminAuthorizationFixture[];

export const auditAdminFailureClasses = [
  'authentication-required',
  'mfa-required',
  'forbidden',
  'purpose-required',
  'validation-failed',
  'not-found',
  'legal-gate-disabled',
  'idempotency-key-reused',
  'idempotency-in-progress',
  'export-range-invalid',
  'export-state-conflict',
  'audit-integrity-failed',
  'retention-proof-failed',
  'rate-limited',
  'service-unavailable',
] as const;

const zeroHash = '0'.repeat(64);

export const auditAdminIntegrityFixtures = {
  clock: new Date('2026-09-01T12:00:00.000Z'),
  auditPage: {
    limitBoundaries: [1, 100, 101],
    opaqueCursors: ['c3ludGhldGljLTAwOC1maXJzdA', 'c3ludGhldGljLTAwOC1uZXh0'],
  },
  chain: {
    version: 1,
    genesisHash: zeroHash,
    partitions: ['2026-05-01', '2026-06-01', '2026-07-01'],
    eventIds: [
      '82000000-0000-4000-8000-000000000001',
      '82000000-0000-4000-8000-000000000002',
      '82000000-0000-4000-8000-000000000003',
    ],
  },
  export: {
    batchId: '83000000-0000-4000-8000-000000000001',
    partitionStart: '2026-05-01',
    partitionEndExclusive: '2026-08-01',
    idempotencyKeys: ['synthetic-008-audit-export-0001', 'synthetic-008-audit-export-changed-0002'],
    failureModes: [
      'transient',
      'permanent_schema',
      'service_auth',
      'retention_proof',
      'lease_expired',
      'dead_letter',
    ],
  },
  health: {
    statuses: ['ready', 'degraded', 'not_ready'],
    readinessReasons: [
      'database_unavailable',
      'outbox_backlog',
      'outbox_integrity_failed',
      'audit_integrity_failed',
      'export_proof_failed',
    ],
  },
} as const;

export const auditAdminSyntheticSentinels = {
  nationalId: 'SYNTHETIC-008-NATIONAL-ID-MUST-NOT-LEAVE-SOURCE',
  accessToken: 'SYNTHETIC-008-ACCESS-TOKEN-MUST-NOT-LEAVE-SOURCE',
  signedUrl: 'SYNTHETIC-008-SIGNED-URL-MUST-NOT-LEAVE-SOURCE',
  objectCredential: 'SYNTHETIC-008-OBJECT-CREDENTIAL-MUST-NOT-LEAVE-SOURCE',
  clinicalPayload: 'SYNTHETIC-008-CLINICAL-PAYLOAD-MUST-NOT-LEAVE-SOURCE',
  freeText: 'SYNTHETIC-008-FREE-TEXT-MUST-NOT-LEAVE-SOURCE',
  subjectIdentifier: 'SYNTHETIC-008-SUBJECT-ID-MUST-NOT-LEAVE-SOURCE',
  suppressedCount: 'SYNTHETIC-008-SUPPRESSED-COUNT-MUST-NOT-LEAVE-SOURCE',
  rawCursor: 'SYNTHETIC-008-RAW-CURSOR-MUST-NOT-ENTER-TELEMETRY',
  rawAuditMetadata: 'SYNTHETIC-008-RAW-AUDIT-METADATA-MUST-NOT-LEAVE-SOURCE',
} as const;
