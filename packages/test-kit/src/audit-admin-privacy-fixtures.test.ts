import { describe, expect, it } from 'vitest';

import {
  auditAdminApprovedPrivacyPolicy,
  auditAdminPrivacyVectors,
} from './audit-admin-privacy-fixtures.js';

describe('008 approved privacy fixtures', () => {
  it('pins the approved inactive policy contract', () => {
    expect(auditAdminApprovedPrivacyPolicy.threshold).toEqual({
      minimumReleasableDistinctSubjects: 11,
      primarySuppressionMin: 0,
      primarySuppressionMax: 10,
      personDerivedZeroPolicy: 'suppress',
    });
    expect(auditAdminApprovedPrivacyPolicy.metrics).toEqual([]);
    expect(auditAdminApprovedPrivacyPolicy.allowedTimeDimensions).toEqual(['calendar_month_utc']);
    expect(
      auditAdminApprovedPrivacyPolicy.allowedCategoricalDimensions.approved_workflow_status_class,
    ).toEqual([]);
  });

  it('reports 34 uniquely named deterministic vectors in canonical order', () => {
    expect(auditAdminPrivacyVectors).toHaveLength(34);
    expect(new Set(auditAdminPrivacyVectors.map(({ id }) => id)).size).toBe(34);
    expect(auditAdminPrivacyVectors.map(({ id }) => id)).toEqual(
      Array.from({ length: 34 }, (_, index) => `TV-PRIV-001-${String(index + 1).padStart(3, '0')}`),
    );
  });

  it('covers boundary, dimension, differencing, locale, retry, and attack classes', () => {
    expect(new Set(auditAdminPrivacyVectors.map(({ vectorClass }) => vectorClass))).toEqual(
      new Set([
        'boundary',
        'distinct-subject',
        'dimension',
        'complementary-suppression',
        'linked-release',
        'locale',
        'authorization',
        'configuration',
        'side-channel',
        'retry',
        'snapshot',
        'summary-operation',
        'measure',
      ]),
    );
    expect(auditAdminPrivacyVectors.every(({ expected }) => expected.reason.length > 0)).toBe(true);
  });
});
