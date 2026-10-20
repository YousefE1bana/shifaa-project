import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const enabled = process.env['SHIFAA_RUN_POSTGRES_ADAPTER'] === 'true';
const ownerUrl = 'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa';
const apiUrl = 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa';

describe.skipIf(!enabled)('facility PostgreSQL adapter', () => {
  const owner = postgres(ownerUrl, { max: 1 });
  const personId = randomUUID();
  const userId = randomUUID();
  const approverId = randomUUID();
  const superA = randomUUID();
  const superB = randomUUID();
  const targetId = randomUUID();
  let harness: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await owner`insert into identity.people(id,user_id,display_name,nationality_code,preferred_locale,profile_status) values
      (${personId}::uuid,${userId}::uuid,'Synthetic persistent owner','EG','en-EG','active'),
      (${approverId}::uuid,${randomUUID()}::uuid,'Synthetic persistent approver','EG','en-EG','active'),
      (${superA}::uuid,${randomUUID()}::uuid,'Synthetic persistent super A','EG','en-EG','active'),
      (${superB}::uuid,${randomUUID()}::uuid,'Synthetic persistent super B','EG','en-EG','active'),
      (${targetId}::uuid,${randomUUID()}::uuid,'Synthetic persistent target','EG','en-EG','active')`;
    const base = loadConfig({ NODE_ENV: 'test' });
    harness = await buildApp({
      config: { ...base, repositoryAdapter: 'postgres', databaseUrl: apiUrl },
    });
  });

  afterAll(async () => {
    await harness?.app.close();
    await owner.end({ timeout: 5 });
  });

  it('atomically persists one domain row, audit, outbox, and replay result', async () => {
    const request = {
      method: 'POST' as const,
      url: '/v1/facilities',
      headers: {
        authorization: `Bearer synthetic-person:${personId}`,
        'idempotency-key': `persistent-${randomUUID()}`,
      },
      payload: {
        facility_type: 'clinic',
        name_ar: 'عيادة اصطناعية دائمة',
        name_en: 'Persistent synthetic clinic',
        governorate_code: 'CA',
        city: 'Cairo',
        district: 'Synthetic',
        address_line: 'Synthetic persistent address',
      },
    };
    const created = await harness.app.inject(request);
    expect(created.statusCode).toBe(201);
    const body = created.json() as { id: string };
    const replay = await harness.app.inject(request);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(created.json());
    const [counts] = (await owner`select
      (select count(*)::int from identity.facilities where id=${body.id}::uuid) facilities,
      (select count(*)::int from identity.facility_memberships where facility_id=${body.id}::uuid) memberships,
      (select count(*)::int from audit.events where resource_id=${body.id}::uuid) audits,
      (select count(*)::int from platform.outbox_events where aggregate_id=${body.id}::uuid) outbox`) as unknown as Array<{
      facilities: number;
      memberships: number;
      audits: number;
      outbox: number;
    }>;
    expect(counts).toEqual({ facilities: 1, memberships: 1, audits: 1, outbox: 1 });
    const conflict = await harness.app.inject({
      ...request,
      payload: { ...request.payload, name_en: 'Changed replay payload' },
    });
    expect(conflict.statusCode).toBe(409);
  });

  it('persists deterministic scan release, review, and independent grant revocation', async () => {
    const key = () => `persistent-${randomUUID()}`;
    const created = await harness.app.inject({
      method: 'POST',
      url: '/v1/facilities',
      headers: { authorization: `Bearer synthetic-person:${personId}`, 'idempotency-key': key() },
      payload: {
        facility_type: 'clinic',
        name_ar: 'عيادة فحص اصطناعية',
        name_en: 'Synthetic scanner clinic',
        governorate_code: 'CA',
        city: 'Cairo',
        district: 'Synthetic',
        address_line: 'Synthetic scanner address',
      },
    });
    const facility = created.json();
    const uploaded = await harness.app.inject({
      method: 'POST',
      url: `/v1/facilities/${facility.id}/licenses/upload-intent`,
      headers: { authorization: `Bearer synthetic-person:${personId}`, 'idempotency-key': key() },
      payload: {
        mime_type: 'application/pdf',
        size_bytes: 100,
        sha256: '1'.repeat(64),
        license_type: 'synthetic',
        license_number: `SYN-${randomUUID()}`,
        issuer: 'Synthetic',
        expires_on: '2030-01-01',
        licensed_activities: ['synthetic'],
      },
    });
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    expect(uploaded.json().scan_status).toBe('quarantined');
    await owner`update identity.private_evidence_objects set scan_status='released',released_at=now() where id=${uploaded.json().object_id}::uuid`;
    const submitted = await harness.app.inject({
      method: 'POST',
      url: `/v1/facilities/${facility.id}/submit`,
      headers: {
        authorization: `Bearer synthetic-person:${personId}`,
        'idempotency-key': key(),
        'if-match': '"2"',
        'x-aal': '2',
      },
      payload: {},
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    const reviewed = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/facilities/${facility.id}/decision`,
      headers: {
        authorization: `Bearer synthetic-admin:facility_approver:${approverId}`,
        'idempotency-key': key(),
        'if-match': '"3"',
        'x-aal': '2',
        'x-purpose': 'facility_approval',
      },
      payload: { decision: 'approve', reason: 'Persistent independent review' },
    });
    expect(reviewed.statusCode).toBe(200);
    const [verifiedFacilityLicense] = await owner<{ status: string }[]>`
      select status from identity.facility_licenses where facility_id=${facility.id}::uuid`;
    expect(verifiedFacilityLicense?.status).toBe('verified');
    const proposed = await harness.app.inject({
      method: 'POST',
      url: '/v1/admin/role-grants',
      headers: {
        authorization: `Bearer synthetic-admin:super_admin:${superA}`,
        'idempotency-key': key(),
        'x-aal': '2',
        'x-purpose': 'role_governance',
      },
      payload: {
        person_id: targetId,
        role_code: 'facility_approver',
        valid_from: '2026-08-11T00:00:00Z',
        reason: 'Persistent grant',
      },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    const grant = proposed.json();
    const decided = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/role-grants/${grant.id}/decision`,
      headers: {
        authorization: `Bearer synthetic-admin:super_admin:${superB}`,
        'idempotency-key': key(),
        'if-match': '"1"',
        'x-aal': '2',
        'x-purpose': 'role_governance',
      },
      payload: { decision: 'approve', reason: 'Persistent independent grant' },
    });
    expect(decided.statusCode, decided.body).toBe(200);
    const revoke = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/role-grants/${grant.id}/revocation-requests`,
      headers: {
        authorization: `Bearer synthetic-admin:super_admin:${superA}`,
        'idempotency-key': key(),
        'if-match': '"2"',
        'x-aal': '2',
        'x-purpose': 'role_governance',
      },
      payload: { reason: 'Persistent revocation' },
    });
    expect(revoke.statusCode).toBe(201);
    const revoked = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/role-grant-revocations/${revoke.json().id}/decision`,
      headers: {
        authorization: `Bearer synthetic-admin:super_admin:${superB}`,
        'idempotency-key': key(),
        'if-match': '"1"',
        'x-aal': '2',
        'x-purpose': 'role_governance',
      },
      payload: { decision: 'approve', reason: 'Persistent independent revocation' },
    });
    expect(revoked.statusCode).toBe(200);
    const [stored] =
      await owner`select status from identity.admin_role_grants where id=${grant.id}::uuid`;
    expect(stored?.['status']).toBe('revoked');
  });
});
