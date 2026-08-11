import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type AppHarness } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { FacilityOnboardingService } from '../src/modules/facility-onboarding/index.js';

const owner = '30000000-0000-4000-8000-000000000001',
  worker = '30000000-0000-4000-8000-000000000002',
  approver = '30000000-0000-4000-8000-000000000010',
  superA = '30000000-0000-4000-8000-000000000011',
  superB = '30000000-0000-4000-8000-000000000012';
const person = (id: string) => `synthetic-person:${id}`;
const admin = (role: string, id: string) => `synthetic-admin:${role}:${id}`;
const baseHeaders = (token: string, key?: string, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${token}`,
  ...(key ? { 'idempotency-key': key } : {}),
  ...extra,
});

describe('OPEN-SEC-001 facility session gate', () => {
  it('denies explicit production enablement and non-synthetic bearer parsing', async () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', FACILITY_ONBOARDING_ENABLED: 'true' }),
    ).toThrow(/OPEN-SEC-001/);
    const base = loadConfig({ NODE_ENV: 'test' });
    const gated = await buildApp({ config: { ...base, syntheticMode: false } });
    try {
      const response = await gated.app.inject({
        method: 'GET',
        url: '/v1/facilities/30000000-0000-4000-8000-000000000001',
        headers: { authorization: `Bearer ${person(owner)}` },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().type).toContain('open-sec-001');
    } finally {
      await gated.app.close();
    }
  });
});
describe('facility onboarding and contextual RBAC', () => {
  let harness: AppHarness;
  beforeEach(async () => {
    harness = await buildApp({ clock: { now: () => new Date('2026-08-11T08:00:00Z') } });
  });
  afterEach(async () => harness.app.close());
  async function createFacility(
    type: 'clinic' | 'pharmacy' | 'hospital' | 'laboratory',
    suffix: string,
  ) {
    return harness.app.inject({
      method: 'POST',
      url: '/v1/facilities',
      headers: baseHeaders(person(owner), `create-facility-${suffix}-0001`),
      payload: {
        facility_type: type,
        name_ar: `منشأة ${suffix}`,
        name_en: `Facility ${suffix}`,
        governorate_code: 'CA',
        city: 'Cairo',
        district: 'Nasr City',
        address_line: 'Synthetic address only',
      },
    });
  }
  it('creates attributable owner memberships for four separate types and replays once', async () => {
    for (const type of ['clinic', 'pharmacy', 'hospital', 'laboratory'] as const) {
      const key = `create-facility-${type}-0001`;
      const first = await createFacility(type, type);
      expect(first.statusCode).toBe(201);
      const replay = await createFacility(type, type);
      expect(replay.statusCode).toBe(201);
      expect(replay.json().id).toBe(first.json().id);
    }
    expect(harness.facilityService.facilities.size).toBe(4);
    expect(harness.facilityService.memberships.size).toBe(4);
    expect(harness.facilityService.audit).toHaveLength(4);
    expect(harness.facilityService.outbox).toHaveLength(4);
  });
  it('enforces declared opaque cursor validation and per-actor synthetic read limits', async () => {
    const created = await createFacility('clinic', 'rate-limit');
    const facility = created.json();
    const invalidCursor = await harness.app.inject({
      method: 'GET',
      url: '/v1/admin/facilities?cursor=not-opaque',
      headers: baseHeaders(admin('facility_approver', approver), undefined, {
        'x-aal': '2',
        'x-purpose': 'facility_approval',
      }),
    });
    expect(invalidCursor.statusCode).toBe(400);
    for (let index = 0; index < 120; index++) {
      const response = await harness.app.inject({
        method: 'GET',
        url: `/v1/facilities/${facility.id}`,
        headers: baseHeaders(person(owner)),
      });
      expect(response.statusCode).toBe(200);
    }
    const limited = await harness.app.inject({
      method: 'GET',
      url: `/v1/facilities/${facility.id}`,
      headers: baseHeaders(person(owner)),
    });
    expect(limited.statusCode).toBe(429);
  });
  it('runs quarantine, independent approval, licensed membership, and cross-facility denials', async () => {
    const created = await createFacility('clinic', 'clinic');
    const facility = created.json();
    const upload = await harness.app.inject({
      method: 'POST',
      url: `/v1/facilities/${facility.id}/licenses/upload-intent`,
      headers: baseHeaders(person(owner), 'facility-upload-0000001'),
      payload: {
        mime_type: 'application/pdf',
        size_bytes: 1024,
        sha256: 'a'.repeat(64),
        license_type: 'clinic',
        license_number: 'SYN-CLINIC-001',
        issuer: 'Synthetic authority',
        expires_on: '2027-08-11',
        licensed_activities: ['consultation'],
      },
    });
    expect(upload.statusCode).toBe(201);
    const lowAalSubmit = await harness.app.inject({
      method: 'POST',
      url: `/v1/facilities/${facility.id}/submit`,
      headers: baseHeaders(person(owner), 'facility-submit-low-aal', {
        'if-match': `"${facility.version + 1}"`,
      }),
      payload: {},
    });
    expect(lowAalSubmit.statusCode).toBe(403);
    const submitHeaders = baseHeaders(person(owner), 'facility-submit-0000001', {
      'if-match': `"${facility.version + 1}"`,
      'x-aal': '2',
    });
    const blocked = await harness.app.inject({
      method: 'POST',
      url: `/v1/facilities/${facility.id}/submit`,
      headers: submitHeaders,
      payload: {},
    });
    expect(blocked.statusCode).toBe(409);
    expect(harness.facilityService).toBeInstanceOf(FacilityOnboardingService);
    (harness.facilityService as FacilityOnboardingService).releaseEvidenceForSyntheticScanner(
      upload.json().object_id,
    );
    const submitted = await harness.app.inject({
      method: 'POST',
      url: `/v1/facilities/${facility.id}/submit`,
      headers: { ...submitHeaders, 'idempotency-key': 'facility-submit-0000002' },
      payload: {},
    });
    expect(submitted.statusCode).toBe(200);
    const wrongRole = await harness.app.inject({
      method: 'GET',
      url: '/v1/admin/facilities',
      headers: baseHeaders(admin('support_admin', superA), undefined, {
        'x-aal': '2',
        'x-purpose': 'facility_approval',
      }),
    });
    expect(wrongRole.statusCode).toBe(403);
    const missingPurpose = await harness.app.inject({
      method: 'GET',
      url: '/v1/admin/facilities',
      headers: baseHeaders(admin('facility_approver', approver), undefined, { 'x-aal': '2' }),
    });
    expect(missingPurpose.statusCode).toBe(403);
    const minimumProjectionMissingPurpose = await harness.app.inject({
      method: 'GET',
      url: `/v1/facilities/${facility.id}`,
      headers: baseHeaders(admin('facility_approver', approver), undefined, { 'x-aal': '2' }),
    });
    expect(minimumProjectionMissingPurpose.statusCode).toBe(403);
    const approved = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/facilities/${facility.id}/decision`,
      headers: baseHeaders(admin('facility_approver', approver), 'facility-review-0000001', {
        'x-aal': '2',
        'x-purpose': 'facility_approval',
        'if-match': `"${submitted.json().version}"`,
      }),
      payload: { decision: 'approve', reason: 'Synthetic evidence released' },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().facility_status).toBe('active');
    expect(
      [...harness.facilityService.facilityLicenses.values()].some(
        (value) => value.facility_id === facility.id && value.status === 'verified',
      ),
    ).toBe(true);
    const licenseCreated = await harness.app.inject({
      method: 'POST',
      url: '/v1/people/me/professional-licenses',
      headers: baseHeaders(person(worker), 'professional-create-001'),
      payload: {
        profession: 'doctor',
        license_number: 'SYN-DOC-001',
        issuer: 'Synthetic authority',
        expires_on: '2027-08-11',
      },
    });
    const license = licenseCreated.json();
    const professionalUpload = await harness.app.inject({
      method: 'POST',
      url: `/v1/professional-licenses/${license.id}/upload-intent`,
      headers: baseHeaders(person(worker), 'professional-upload-001'),
      payload: { mime_type: 'application/pdf', size_bytes: 1024, sha256: 'b'.repeat(64) },
    });
    (harness.facilityService as FacilityOnboardingService).releaseEvidenceForSyntheticScanner(
      professionalUpload.json().object_id,
    );
    const verified = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/professional-licenses/${license.id}/decision`,
      headers: baseHeaders(admin('facility_approver', approver), 'professional-review-001', {
        'x-aal': '2',
        'x-purpose': 'professional_license_review',
        'if-match': `"${license.version + 1}"`,
      }),
      payload: { decision: 'verify', reason: 'Synthetic license evidence released' },
    });
    expect(verified.statusCode).toBe(200);
    const invite = await harness.app.inject({
      method: 'POST',
      url: `/v1/facilities/${facility.id}/memberships`,
      headers: baseHeaders(person(owner), 'membership-invite-001'),
      payload: {
        person_id: worker,
        role_code: 'doctor',
        employment_license_id: license.id,
        valid_from: '2026-08-11T08:00:00Z',
      },
    });
    expect(invite.statusCode).toBe(201);
    const mismatchedInvite = await harness.app.inject({
      method: 'POST',
      url: `/v1/facilities/${facility.id}/memberships`,
      headers: baseHeaders(person(owner), 'membership-invite-mismatch'),
      payload: {
        person_id: worker,
        role_code: 'pharmacist',
        employment_license_id: license.id,
        valid_from: '2026-08-11T08:00:00Z',
      },
    });
    expect(mismatchedInvite.statusCode).toBe(409);
    const invitedMembership = harness.facilityService.memberships.get(invite.json().id)!;
    invitedMembership.invite_expires_at = '2026-08-10T08:00:00Z';
    const expiredAccept = await harness.app.inject({
      method: 'POST',
      url: `/v1/facility-membership-invites/${invite.json().invite_token}/accept`,
      headers: baseHeaders(person(worker), 'membership-accept-expired'),
      payload: {},
    });
    expect(expiredAccept.statusCode).toBe(409);
    invitedMembership.invite_expires_at = '2026-08-12T08:00:00Z';
    const accepted = await harness.app.inject({
      method: 'POST',
      url: `/v1/facility-membership-invites/${invite.json().invite_token}/accept`,
      headers: baseHeaders(person(worker), 'membership-accept-001'),
      payload: {},
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().status).toBe('active');
    const invalidPatch = await harness.app.inject({
      method: 'PATCH',
      url: `/v1/facilities/${facility.id}/memberships/${accepted.json().id}`,
      headers: baseHeaders(person(owner), 'membership-update-mismatch', { 'if-match': '"2"' }),
      payload: { role_code: 'pharmacist' },
    });
    expect(invalidPatch.statusCode).toBe(409);
    const other = await createFacility('clinic', 'other');
    const cross = await harness.app.inject({
      method: 'GET',
      url: `/v1/facilities/${other.json().id}`,
      headers: baseHeaders(person(worker)),
    });
    expect(cross.statusCode).toBe(403);
    expect(harness.facilityService.audit.every((row) => row['actor_person_id'])).toBe(true);
  });
  it('requires independent actors for grant and revocation and rejects changed replays', async () => {
    const grant = await harness.app.inject({
      method: 'POST',
      url: '/v1/admin/role-grants',
      headers: baseHeaders(admin('super_admin', superA), 'grant-proposal-0001', {
        'x-aal': '2',
        'x-purpose': 'role_governance',
      }),
      payload: {
        person_id: approver,
        role_code: 'facility_approver',
        valid_from: '2026-08-11T08:00:00Z',
        reason: 'Synthetic assignment',
      },
    });
    expect(grant.statusCode).toBe(201);
    const self = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/role-grants/${grant.json().id}/decision`,
      headers: baseHeaders(admin('super_admin', superA), 'grant-decision-self01', {
        'x-aal': '2',
        'x-purpose': 'role_governance',
        'if-match': '"1"',
      }),
      payload: { decision: 'approve', reason: 'self' },
    });
    expect(self.statusCode).toBe(403);
    const decided = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/role-grants/${grant.json().id}/decision`,
      headers: baseHeaders(admin('super_admin', superB), 'grant-decision-0001', {
        'x-aal': '2',
        'x-purpose': 'role_governance',
        'if-match': '"1"',
      }),
      payload: { decision: 'approve', reason: 'Independent review' },
    });
    expect(decided.statusCode).toBe(200);
    const changed = await harness.app.inject({
      method: 'POST',
      url: '/v1/admin/role-grants',
      headers: baseHeaders(admin('super_admin', superA), 'grant-proposal-0001', {
        'x-aal': '2',
        'x-purpose': 'role_governance',
      }),
      payload: {
        person_id: worker,
        role_code: 'support_admin',
        valid_from: '2026-08-11T08:00:00Z',
        reason: 'Changed body',
      },
    });
    expect(changed.statusCode).toBe(409);
    const revocation = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/role-grants/${grant.json().id}/revocation-requests`,
      headers: baseHeaders(admin('super_admin', superA), 'revoke-proposal-001', {
        'x-aal': '2',
        'x-purpose': 'role_governance',
        'if-match': '"2"',
      }),
      payload: { reason: 'Synthetic end' },
    });
    expect(revocation.statusCode).toBe(201);
    const revoked = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/role-grant-revocations/${revocation.json().id}/decision`,
      headers: baseHeaders(admin('super_admin', superB), 'revoke-decision-001', {
        'x-aal': '2',
        'x-purpose': 'role_governance',
        'if-match': '"1"',
      }),
      payload: { decision: 'approve', reason: 'Independent revocation' },
    });
    expect(revoked.statusCode).toBe(200);
    expect(harness.facilityService.grants.get(grant.json().id)?.status).toBe('revoked');
  });
});
