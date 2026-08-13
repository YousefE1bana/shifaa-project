import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const enabled = process.env['SHIFAA_RUN_FAMILY_POSTGRES'] === 'true';
const ownerUrl = 'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa';
const apiUrl = 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa';
const ids = {
  self: randomUUID(),
  dependent: randomUUID(),
  guardian: randomUUID(),
  delegate: randomUUID(),
  reviewer: randomUUID(),
  selfPatient: randomUUID(),
  dependentPatient: randomUUID(),
  releasedEvidence: randomUUID(),
};
const person = (id: string) => `Bearer synthetic-person:${id}`;
const admin = (id: string) => `Bearer synthetic-admin:support_admin:${id}`;
const syntheticNow = '2099-08-11T09:00:00.000Z';
const syntheticValidUntil = '2100-08-11T09:00:00.000Z';

describe.skipIf(!enabled)('family PostgreSQL adapter', () => {
  const owner = postgres(ownerUrl, { max: 1 });
  const contactPhone = `+999${String(Date.now()).slice(-9)}`;
  let harness: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    const run = randomUUID();
    await owner`insert into identity.people(id,user_id,display_name,nationality_code,preferred_locale,profile_status) values
      (${ids.self}::uuid,${randomUUID()}::uuid,'Synthetic family self','EG','en-EG','active'),
      (${ids.dependent}::uuid,${randomUUID()}::uuid,'Synthetic family dependent','EG','en-EG','active'),
      (${ids.guardian}::uuid,${randomUUID()}::uuid,'Synthetic family guardian','EG','en-EG','active'),
      (${ids.delegate}::uuid,${randomUUID()}::uuid,'Synthetic family delegate','EG','en-EG','active'),
      (${ids.reviewer}::uuid,${randomUUID()}::uuid,'Synthetic family reviewer','EG','en-EG','active')`;
    await owner`insert into identity.patients(id,person_id,medical_record_number) values
      (${ids.selfPatient}::uuid,${ids.self}::uuid,${`SYN-SELF-${run}`}),
      (${ids.dependentPatient}::uuid,${ids.dependent}::uuid,${`SYN-DEP-${run}`})`;
    await owner`insert into identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,created_by_person_id) values
      (${randomUUID()}::uuid,${ids.selfPatient}::uuid,${ids.self}::uuid,'self','active','2026-01-01T00:00:00Z',${ids.self}::uuid),
      (${randomUUID()}::uuid,${ids.dependentPatient}::uuid,${ids.dependent}::uuid,'self','active','2026-01-01T00:00:00Z',${ids.dependent}::uuid)`;
    await owner`insert into identity.private_evidence_objects(id,bucket_code,object_key,owner_person_id,resource_patient_id,sha256,mime_type,size_bytes,scan_status,released_at) values
      (${ids.releasedEvidence}::uuid,'guardianship-evidence',${`synthetic/family/${run}`},${ids.guardian}::uuid,${ids.dependentPatient}::uuid,${'8'.repeat(64)},'application/pdf',1024,'released','2026-08-11T08:00:00Z')`;
    const base = loadConfig({ NODE_ENV: 'test' });
    harness = await buildApp({
      config: { ...base, repositoryAdapter: 'postgres', databaseUrl: apiUrl },
      clock: { now: () => new Date(syntheticNow) },
    });
  });
  afterAll(async () => {
    await harness?.app.close();
    await owner.end({ timeout: 5 });
  });

  it('persists guardianship, independent review, permission history, audit, and outbox atomically', async () => {
    const key = () => `family-pg-${randomUUID()}`;
    const created = await harness.app.inject({
      method: 'POST',
      url: `/v1/patients/${ids.dependentPatient}/guardianships`,
      headers: {
        authorization: person(ids.guardian),
        'x-shifaa-patient-context': ids.dependentPatient,
        'idempotency-key': key(),
      },
      payload: {
        evidence_object_id: ids.releasedEvidence,
        purpose_code: 'dependent_care',
        requested_permissions: ['record.view', 'appointment.manage'],
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const relationship = created.json();
    const reviewed = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/guardianships/${relationship.id}/decision`,
      headers: {
        authorization: admin(ids.reviewer),
        'x-aal': '2',
        'x-purpose': 'guardianship_review',
        'if-match': '"1"',
        'idempotency-key': key(),
      },
      payload: {
        decision: 'approved',
        reason_code: 'synthetic_approved',
        approved_permissions: ['record.view'],
        valid_until: syntheticValidUntil,
      },
    });
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    expect(reviewed.json()).toMatchObject({
      status: 'active',
      version: 2,
      permissions: ['record.view'],
    });
    const [counts] = await owner<any[]>`select
      (select count(*)::int from identity.care_relationships where id=${relationship.id}::uuid and status='active') relationships,
      (select count(*)::int from identity.care_relationship_permissions where relationship_id=${relationship.id}::uuid and revoked_at is null) active_permissions,
      (select count(*)::int from identity.care_relationship_permissions where relationship_id=${relationship.id}::uuid and revoked_at is not null) revoked_permissions,
      (select count(*)::int from audit.events where resource_id=${relationship.id}::uuid) audits,
      (select count(*)::int from platform.outbox_events where aggregate_id=${relationship.id}::uuid) outbox`;
    expect(counts).toEqual({
      relationships: 1,
      active_permissions: 1,
      revoked_permissions: 1,
      audits: 2,
      outbox: 2,
    });
  });

  it('persists HMAC-only delegation acceptance and terminal replay denial', async () => {
    const createKey = `family-pg-${randomUUID()}`;
    const created = await harness.app.inject({
      method: 'POST',
      url: `/v1/patients/${ids.selfPatient}/delegations`,
      headers: {
        authorization: person(ids.self),
        'x-shifaa-patient-context': ids.selfPatient,
        'idempotency-key': createKey,
      },
      payload: {
        delegate_person_id: ids.delegate,
        purpose_code: 'family_support',
        permissions: ['record.view'],
        valid_until: syntheticValidUntil,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const value = created.json();
    expect(new Date(value.invitation_expires_at).getTime()).toBeGreaterThan(Date.now());
    const createReplay = await harness.app.inject({
      method: 'POST',
      url: `/v1/patients/${ids.selfPatient}/delegations`,
      headers: {
        authorization: person(ids.self),
        'x-shifaa-patient-context': ids.selfPatient,
        'idempotency-key': createKey,
      },
      payload: {
        delegate_person_id: ids.delegate,
        purpose_code: 'family_support',
        permissions: ['record.view'],
        valid_until: syntheticValidUntil,
      },
    });
    expect(createReplay.json()).toEqual(value);
    const [idempotency] = await owner<
      any[]
    >`select response_body::text body from platform.idempotency_records where idempotency_key=${createKey}`;
    expect(idempotency.body).not.toContain(value.invitation_token);
    expect(idempotency.body).toContain('aes-256-gcm-v1');
    const accepted = await harness.app.inject({
      method: 'POST',
      url: `/v1/delegations/${value.relationship.id}/accept`,
      headers: {
        authorization: person(ids.delegate),
        'idempotency-key': `family-pg-${randomUUID()}`,
      },
      payload: { token: value.invitation_token, confirmed: true },
    });
    expect(accepted.statusCode).toBe(200);
    const [stored] = await owner<
      any[]
    >`select status,invite_token_digest,invite_consumed_at from identity.care_relationships where id=${value.relationship.id}::uuid`;
    expect(stored.status).toBe('active');
    expect(stored.invite_token_digest).toBeNull();
    expect(stored.invite_consumed_at).not.toBeNull();
    const updated = await harness.app.inject({
      method: 'PATCH',
      url: `/v1/delegations/${value.relationship.id}`,
      headers: {
        authorization: person(ids.self),
        'x-shifaa-patient-context': ids.selfPatient,
        'if-match': '"2"',
        'idempotency-key': `family-pg-${randomUUID()}`,
      },
      payload: { permissions: ['record.view', 'appointment.manage'] },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    const [afterUpdate] = await owner<
      any[]
    >`select invite_consumed_at from identity.care_relationships where id=${value.relationship.id}::uuid`;
    expect(new Date(afterUpdate.invite_consumed_at).toISOString()).toBe(
      new Date(stored.invite_consumed_at).toISOString(),
    );
    const replay = await harness.app.inject({
      method: 'POST',
      url: `/v1/delegations/${value.relationship.id}/accept`,
      headers: {
        authorization: person(ids.delegate),
        'idempotency-key': `family-pg-${randomUUID()}`,
      },
      payload: { token: value.invitation_token, confirmed: true },
    });
    expect(replay.statusCode).toBe(403);
  });

  it('encrypts contact data and consumes the public invitation once without an oracle', async () => {
    const created = await harness.app.inject({
      method: 'POST',
      url: `/v1/patients/${ids.selfPatient}/emergency-contacts`,
      headers: {
        authorization: person(ids.self),
        'x-shifaa-patient-context': ids.selfPatient,
        'idempotency-key': `family-pg-${randomUUID()}`,
      },
      payload: {
        display_name: 'Synthetic persistent contact',
        phone_e164: contactPhone,
        preferred_locale: 'en-EG',
        location_precision: 'coarse',
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const value = created.json();
    expect(new Date(value.contact.invite_expires_at).getTime()).toBeGreaterThan(Date.now());
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/emergency-contact-invites/response',
      headers: { 'idempotency-key': `family-pg-${randomUUID()}` },
      payload: { token: value.invitation_token, decision: 'confirmed' },
    });
    expect(response.statusCode).toBe(200);
    const [stored] = await owner<
      any[]
    >`select status,masked_phone,display_name_ciphertext,phone_ciphertext,invite_token_digest from identity.emergency_contacts where id=${value.contact.id}::uuid`;
    expect(stored.status).toBe('confirmed');
    expect(stored.masked_phone).not.toBe(contactPhone);
    expect(Buffer.from(stored.display_name_ciphertext).toString()).not.toContain(
      'Synthetic persistent contact',
    );
    expect(Buffer.from(stored.phone_ciphertext).toString()).not.toContain(contactPhone);
    expect(Buffer.from(stored.invite_token_digest)).toHaveLength(32);
    const terminal = await harness.app.inject({
      method: 'POST',
      url: '/v1/emergency-contact-invites/response',
      headers: { 'idempotency-key': `family-pg-${randomUUID()}` },
      payload: { token: value.invitation_token, decision: 'declined' },
    });
    expect(terminal.statusCode).toBe(403);
  });
});
