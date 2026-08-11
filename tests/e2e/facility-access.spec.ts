import assert from 'node:assert/strict';
import test from 'node:test';

import { FacilityApiError, FacilityOnboardingClient } from '@shifaa/api-client/facility-onboarding';
import { authorizeFacilityAction } from '@shifaa/core';
import { buildApp } from '../../services/api/src/app.ts';

const base = {
  personId: 'worker',
  facilityId: 'facility-a',
  requestedFacilityId: 'facility-a',
  requestedFacilityType: 'clinic' as const,
  actualFacilityType: 'clinic' as const,
  action: 'regulated.read',
  permissions: ['regulated.read'],
  membershipStatus: 'active' as const,
  professionalLicenseStatus: 'verified' as const,
  professionalLicenseExpiresOn: '2027-01-01',
  regulated: true,
  aal: 2 as const,
  purpose: 'care_delivery',
  requiredPurpose: 'care_delivery',
};

test('matching facility app permits and every contextual mismatch denies', () => {
  assert.equal(authorizeFacilityAction(base, new Date('2026-08-11')).allowed, true);
  assert.equal(
    authorizeFacilityAction({ ...base, requestedFacilityId: 'facility-b' }).reason,
    'facility-mismatch',
  );
  assert.equal(
    authorizeFacilityAction({ ...base, requestedFacilityType: 'hospital' }).reason,
    'application-mismatch',
  );
  assert.equal(authorizeFacilityAction({ ...base, permissions: [] }).reason, 'permission-missing');
  assert.equal(authorizeFacilityAction({ ...base, aal: 1 }).reason, 'aal-insufficient');
  assert.equal(authorizeFacilityAction({ ...base, purpose: undefined }).reason, 'purpose-missing');
  assert.equal(
    authorizeFacilityAction({
      ...base,
      patientRelationshipRequired: true,
      patientRelationshipSatisfied: false,
    }).reason,
    'patient-relationship-missing',
  );
});

test('expired, suspended, rejected, and unverified professional states deny', () => {
  for (const professionalLicenseStatus of ['expired', 'suspended', 'rejected', 'pending'] as const)
    assert.equal(
      authorizeFacilityAction({ ...base, professionalLicenseStatus }, new Date('2026-08-11'))
        .reason,
      'professional-license-invalid',
    );
  assert.equal(
    authorizeFacilityAction(
      { ...base, professionalLicenseExpiresOn: '2025-01-01' },
      new Date('2026-08-11'),
    ).reason,
    'professional-license-invalid',
  );
});

test('generated client probes real server cross-person, role, AAL, and purpose gates', async () => {
  const { app } = await buildApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  try {
    const address = app.server.address();
    assert(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const ownerId = '30000000-0000-4000-8000-000000000001';
    const owner = new FacilityOnboardingClient({
      baseUrl,
      accessToken: `synthetic-person:${ownerId}`,
    });
    const facility = (await owner.createFacility(
      {
        facility_type: 'clinic',
        name_ar: 'عيادة بوابة اصطناعية',
        name_en: 'Synthetic gate clinic',
        governorate_code: 'CA',
        city: 'Cairo',
        district: 'Synthetic',
        address_line: 'Synthetic gate address',
      },
      'generated-client-create-0001',
    )) as { id: string };
    assert.equal(((await owner.getFacility(facility.id)) as { id: string }).id, facility.id);
    const other = new FacilityOnboardingClient({
      baseUrl,
      accessToken: 'synthetic-person:30000000-0000-4000-8000-000000000099',
    });
    await assert.rejects(
      () => other.getFacility(facility.id),
      (error: unknown) => error instanceof FacilityApiError && error.status === 403,
    );
    for (const [accessToken, defaultHeaders] of [
      [
        'synthetic-admin:support_admin:30000000-0000-4000-8000-000000000010',
        { 'X-AAL': '2', 'X-Purpose': 'facility_approval' },
      ],
      ['synthetic-admin:facility_approver:30000000-0000-4000-8000-000000000010', {}],
      ['synthetic-admin:facility_approver:30000000-0000-4000-8000-000000000010', { 'X-AAL': '2' }],
    ] as const) {
      const denied = new FacilityOnboardingClient({ baseUrl, accessToken, defaultHeaders });
      await assert.rejects(
        () => denied.listFacilityApprovalCases(),
        (error: unknown) => error instanceof FacilityApiError && error.status === 403,
      );
    }
    const allowed = new FacilityOnboardingClient({
      baseUrl,
      accessToken: 'synthetic-admin:facility_approver:30000000-0000-4000-8000-000000000010',
      defaultHeaders: { 'X-AAL': '2', 'X-Purpose': 'facility_approval' },
    });
    assert.ok(
      Array.isArray(((await allowed.listFacilityApprovalCases()) as { items: unknown[] }).items),
    );
  } finally {
    await app.close();
  }
});
