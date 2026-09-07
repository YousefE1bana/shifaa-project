import { describe, expect, it } from 'vitest';

import {
  auditAdminAuthorizationFixtures,
  auditAdminFailureClasses,
  auditAdminIntegrityFixtures,
  auditAdminSyntheticSentinels,
} from './audit-admin-fixtures.js';

describe('008 audit, export, health, and authorization fixtures', () => {
  it('validates every required actor and denial context', () => {
    expect(auditAdminAuthorizationFixtures.map(({ scenario }) => scenario)).toEqual([
      'unauthenticated',
      'patient',
      'guardian_or_delegate',
      'workforce',
      'support_admin',
      'medical_reviewer',
      'facility_approver',
      'finance_reviewer',
      'dpo_only',
      'stale_super_admin',
      'revoked_super_admin',
      'super_admin_aal1',
      'super_admin_stale_aal2',
      'super_admin_missing_purpose',
      'super_admin_wrong_purpose',
      'super_admin_current_aal2_purpose',
      'export_worker_service',
      'platform_probe_service',
    ]);
    expect(
      auditAdminAuthorizationFixtures.filter(({ auditRead }) => auditRead === 'allow'),
    ).toHaveLength(1);
    expect(
      auditAdminAuthorizationFixtures.filter(({ adminExport }) => adminExport === 'allow'),
    ).toHaveLength(1);
    expect(
      auditAdminAuthorizationFixtures.filter(({ internalExport }) => internalExport === 'allow'),
    ).toHaveLength(1);
    expect(
      auditAdminAuthorizationFixtures.filter(({ healthProbe }) => healthProbe === 'allow'),
    ).toHaveLength(1);
  });

  it('enumerates every contracted failure class', () => {
    expect(auditAdminFailureClasses).toEqual([
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
    ]);
  });

  it('pins deterministic cursor, chain, export, health, and prohibited sentinels', () => {
    expect(auditAdminIntegrityFixtures.auditPage.limitBoundaries).toEqual([1, 100, 101]);
    expect(auditAdminIntegrityFixtures.chain.partitions).toHaveLength(3);
    expect(auditAdminIntegrityFixtures.export.idempotencyKeys).toHaveLength(2);
    expect(auditAdminIntegrityFixtures.health.readinessReasons).toHaveLength(5);
    expect(new Set(Object.values(auditAdminSyntheticSentinels)).size).toBe(
      Object.keys(auditAdminSyntheticSentinels).length,
    );
    expect(
      Object.values(auditAdminSyntheticSentinels).every((sentinel) =>
        sentinel.startsWith('SYNTHETIC-008-'),
      ),
    ).toBe(true);
  });
});
