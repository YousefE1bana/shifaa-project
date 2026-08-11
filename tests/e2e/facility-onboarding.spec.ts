import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../services/api/src/app.ts';
import { FacilityOnboardingService } from '../../services/api/src/modules/facility-onboarding/index.ts';

const owner = '30000000-0000-4000-8000-000000000001';
const approver = '30000000-0000-4000-8000-000000000010';
const ownerHeaders = (key: string, version?: number) => ({
  authorization: `Bearer synthetic-person:${owner}`,
  'idempotency-key': key,
  'x-aal': '2',
  ...(version ? { 'if-match': `"${version}"` } : {}),
});
const adminHeaders = (key: string, version: number) => ({
  authorization: `Bearer synthetic-admin:facility_approver:${approver}`,
  'idempotency-key': key,
  'if-match': `"${version}"`,
  'x-aal': '2',
  'x-purpose': 'facility_approval',
});

test('API-backed journey governs all four separate facility types', async () => {
  const { app, facilityService } = await buildApp();
  try {
    for (const [index, type] of (
      ['clinic', 'pharmacy', 'hospital', 'laboratory'] as const
    ).entries()) {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/facilities',
        headers: ownerHeaders(`e2e-facility-${type}-create-0001`),
        payload: {
          facility_type: type,
          name_ar: `منشأة اصطناعية ${index}`,
          name_en: `Facility ${index}`,
          governorate_code: 'CA',
          city: 'Cairo',
          district: 'Synthetic',
          address_line: 'Synthetic address',
        },
      });
      assert.equal(created.statusCode, 201);
      const facility = created.json();
      assert.equal(facility.facility_type, type);
      const uploaded = await app.inject({
        method: 'POST',
        url: `/v1/facilities/${facility.id}/licenses/upload-intent`,
        headers: ownerHeaders(`e2e-facility-${type}-upload-0001`),
        payload: {
          mime_type: 'application/pdf',
          size_bytes: 1024,
          sha256: '1'.repeat(64),
          license_type: 'synthetic-facility-license',
          license_number: `SYN-${type}-0001`,
          issuer: 'Synthetic authority',
          expires_on: '2030-08-11',
          licensed_activities: ['synthetic-onboarding'],
        },
      });
      assert.equal(uploaded.statusCode, 201);
      assert.equal(uploaded.json().scan_status, 'quarantined');
      const quarantined = await app.inject({
        method: 'POST',
        url: `/v1/facilities/${facility.id}/submit`,
        headers: ownerHeaders(`e2e-facility-${type}-submit-scan-0001`, 2),
        payload: {},
      });
      assert.equal(quarantined.statusCode, 409);
      assert.ok(facilityService instanceof FacilityOnboardingService);
      facilityService.releaseEvidenceForSyntheticScanner(uploaded.json().object_id);
      const submitted = await app.inject({
        method: 'POST',
        url: `/v1/facilities/${facility.id}/submit`,
        headers: ownerHeaders(`e2e-facility-${type}-submit-0002`, 2),
        payload: {},
      });
      assert.equal(submitted.statusCode, 200);
      assert.equal(submitted.json().facility_status, 'pending_review');
      const decision = index % 2 === 0 ? 'approve' : 'reject';
      const reviewed = await app.inject({
        method: 'POST',
        url: `/v1/admin/facilities/${facility.id}/decision`,
        headers: adminHeaders(`e2e-facility-${type}-decision-0001`, 3),
        payload: { decision, reason: `Synthetic ${decision} evidence` },
      });
      assert.equal(reviewed.statusCode, 200);
      assert.equal(reviewed.json().facility_status, decision === 'approve' ? 'active' : 'rejected');
    }
    assert.equal(facilityService.facilities.size, 4);
    assert.equal(
      facilityService.audit.filter((row) => row.action === 'facility.created').length,
      4,
    );
  } finally {
    await app.close();
  }
});
