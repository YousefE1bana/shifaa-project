import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { familyCareOperationIds } from '@shifaa/contracts';
import { buildApp, type AppHarness } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import {
  redactFamilyRequestPath,
  registeredFamilyCareOperationIds,
} from '../src/routes/family-care.js';

const ids = {
  self: '40000000-0000-4000-8000-000000000001',
  guardian: '40000000-0000-4000-8000-000000000003',
  delegate: '40000000-0000-4000-8000-000000000004',
  reviewer: '40000000-0000-4000-8000-000000000006',
  selfPatient: '41000000-0000-4000-8000-000000000001',
  dependentPatient: '41000000-0000-4000-8000-000000000002',
  releasedEvidence: '42000000-0000-4000-8000-000000000001',
  quarantinedEvidence: '42000000-0000-4000-8000-000000000002',
} as const;
const person = (id: string) => `Bearer synthetic-person:${id}`;
const admin = (id: string) => `Bearer synthetic-admin:support_admin:${id}`;
const mutation = (auth: string, patient?: string, key: string = crypto.randomUUID()) => ({
  authorization: auth,
  'idempotency-key': key,
  ...(patient ? { 'x-shifaa-patient-context': patient } : {}),
});

describe('family care routes', () => {
  let harness: AppHarness;
  beforeEach(async () => {
    harness = await buildApp({ clock: { now: () => new Date('2026-08-11T09:00:00.000Z') } });
  });
  afterEach(async () => {
    await harness.app.close();
  });

  it('registers exactly the twelve approved operations and redacts token paths', () => {
    expect(registeredFamilyCareOperationIds).toEqual(familyCareOperationIds);
    expect(registeredFamilyCareOperationIds).not.toContain('transitionDependent');
    expect(redactFamilyRequestPath('/v1/emergency-contact-invites/raw-secret/response')).toBe(
      '/v1/emergency-contact-invites/[REDACTED]/response',
    );
  });

  it('creates, independently reviews, lists, and revokes guardianship', async () => {
    const created = await harness.app.inject({
      method: 'POST',
      url: `/v1/patients/${ids.dependentPatient}/guardianships`,
      headers: mutation(person(ids.guardian), ids.dependentPatient, 'guardian-create-0001'),
      payload: {
        evidence_object_id: ids.releasedEvidence,
        purpose_code: 'dependent_care',
        requested_permissions: ['record.view', 'consent.manage'],
      },
    });
    expect(created.statusCode).toBe(201);
    const relation = created.json();
    expect(relation.status).toBe('pending');
    expect(JSON.stringify(relation)).not.toContain(ids.releasedEvidence);
    const deniedEvidence = await harness.app.inject({
      method: 'POST',
      url: `/v1/patients/${ids.dependentPatient}/guardianships`,
      headers: mutation(person(ids.guardian), ids.dependentPatient, 'guardian-create-0002'),
      payload: {
        evidence_object_id: ids.quarantinedEvidence,
        purpose_code: 'dependent_care',
        requested_permissions: ['record.view'],
      },
    });
    expect(deniedEvidence.statusCode).toBe(409);
    const review = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/guardianships/${relation.id}/decision`,
      headers: {
        ...mutation(admin(ids.reviewer), undefined, 'guardian-review-0001'),
        'x-aal': '2',
        'x-purpose': 'guardianship_review',
        'if-match': '"1"',
      },
      payload: {
        decision: 'approved',
        reason_code: 'synthetic_approved',
        valid_until: '2027-08-11T09:00:00.000Z',
        approved_permissions: ['record.view'],
      },
    });
    expect(review.statusCode).toBe(200);
    expect(review.json().status).toBe('active');
    const wrongPurpose = await harness.app.inject({
      method: 'GET',
      url: `/v1/patients/${ids.dependentPatient}/relationships`,
      headers: { authorization: person(ids.guardian), 'x-purpose': 'wrong-purpose' },
    });
    expect(wrongPurpose.statusCode).toBe(403);
    const list = await harness.app.inject({
      method: 'GET',
      url: `/v1/patients/${ids.dependentPatient}/relationships`,
      headers: { authorization: person(ids.guardian), 'x-purpose': 'dependent_care' },
    });
    expect(list.statusCode).toBe(200);
    expect(list.headers['cache-control']).toBe('private, no-store');
    expect(list.json().items.some((item: { id: string }) => item.id === relation.id)).toBe(true);
    const revoke = await harness.app.inject({
      method: 'POST',
      url: `/v1/relationships/${relation.id}/revoke`,
      headers: {
        ...mutation(admin(ids.reviewer), ids.dependentPatient, 'guardian-revoke-0001'),
        'x-aal': '2',
        'x-purpose': 'guardianship_review',
        'if-match': '"2"',
      },
      payload: { reason_code: 'synthetic_revoked' },
    });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json().status).toBe('revoked');
  });

  it('delegates one exact action, accepts once, updates, and invalidates on revoke', async () => {
    const created = await harness.app.inject({
      method: 'POST',
      url: `/v1/patients/${ids.selfPatient}/delegations`,
      headers: mutation(person(ids.self), ids.selfPatient, 'delegation-create-0001'),
      payload: {
        delegate_person_id: ids.delegate,
        purpose_code: 'family_support',
        permissions: ['record.view'],
        valid_until: '2027-08-11T09:00:00.000Z',
      },
    });
    expect(created.statusCode).toBe(201);
    const invitation = created.json();
    expect(invitation.relationship.permissions).toEqual(['record.view']);
    const accepted = await harness.app.inject({
      method: 'POST',
      url: `/v1/delegations/${invitation.relationship.id}/accept`,
      headers: mutation(person(ids.delegate), undefined, 'delegation-accept-0001'),
      payload: { token: invitation.invitation_token, confirmed: true },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().status).toBe('active');
    const replay = await harness.app.inject({
      method: 'POST',
      url: `/v1/delegations/${invitation.relationship.id}/accept`,
      headers: mutation(person(ids.delegate), undefined, 'delegation-accept-0002'),
      payload: { token: invitation.invitation_token, confirmed: true },
    });
    expect(replay.statusCode).toBe(403);
    const delegateContacts = await harness.app.inject({
      method: 'GET',
      url: `/v1/patients/${ids.selfPatient}/emergency-contacts`,
      headers: { authorization: person(ids.delegate), 'x-purpose': 'family_support' },
    });
    expect(delegateContacts.statusCode).toBe(403);
    const invalid = await harness.app.inject({
      method: 'POST',
      url: `/v1/patients/${ids.selfPatient}/delegations`,
      headers: mutation(person(ids.self), ids.selfPatient, 'delegation-create-0002'),
      payload: {
        delegate_person_id: ids.delegate,
        purpose_code: 'family_support',
        permissions: ['consent.manage'],
        valid_until: '2027-08-11T09:00:00.000Z',
      },
    });
    expect(invalid.statusCode).toBe(400);
    const updated = await harness.app.inject({
      method: 'PATCH',
      url: `/v1/delegations/${invitation.relationship.id}`,
      headers: {
        ...mutation(person(ids.self), ids.selfPatient, 'delegation-update-0001'),
        'if-match': '"2"',
      },
      payload: { permissions: ['record.view', 'appointment.manage'] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().permissions).toEqual(['record.view', 'appointment.manage']);
    const revoked = await harness.app.inject({
      method: 'POST',
      url: `/v1/relationships/${invitation.relationship.id}/revoke`,
      headers: {
        ...mutation(person(ids.self), ids.selfPatient, 'delegation-revoke-0001'),
        'if-match': '"3"',
      },
      payload: { reason_code: 'synthetic_revoked' },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().status).toBe('revoked');
  });

  it('keeps Emergency Contact consent separate, terminal, masked, and idempotent', async () => {
    const headers = mutation(person(ids.self), ids.selfPatient, 'contact-create-0001');
    const payload = {
      display_name: 'Synthetic Contact',
      phone_e164: '+999000000000',
      preferred_locale: 'ar-EG',
      location_precision: 'coarse',
    };
    const created = await harness.app.inject({
      method: 'POST',
      url: `/v1/patients/${ids.selfPatient}/emergency-contacts`,
      headers,
      payload,
    });
    expect(created.statusCode).toBe(201);
    const invitation = created.json();
    expect(invitation.contact.masked_phone).not.toBe(payload.phone_e164);
    const replay = await harness.app.inject({
      method: 'POST',
      url: `/v1/patients/${ids.selfPatient}/emergency-contacts`,
      headers,
      payload,
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(invitation);
    const changed = await harness.app.inject({
      method: 'POST',
      url: `/v1/patients/${ids.selfPatient}/emergency-contacts`,
      headers,
      payload: { ...payload, location_precision: 'exact' },
    });
    expect(changed.statusCode).toBe(409);
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/emergency-contact-invites/response',
      headers: { 'idempotency-key': 'contact-response-0001' },
      payload: { token: invitation.invitation_token, decision: 'confirmed' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'confirmed' });
    const terminal = await harness.app.inject({
      method: 'POST',
      url: '/v1/emergency-contact-invites/response',
      headers: { 'idempotency-key': 'contact-response-0002' },
      payload: { token: invitation.invitation_token, decision: 'declined' },
    });
    expect(terminal.statusCode).toBe(403);
  });

  it('denies missing or mismatched context and wrong review assurance', async () => {
    const body = {
      delegate_person_id: ids.delegate,
      purpose_code: 'family_support',
      permissions: ['record.view'],
      valid_until: '2027-08-11T09:00:00.000Z',
    };
    expect(
      (
        await harness.app.inject({
          method: 'POST',
          url: `/v1/patients/${ids.selfPatient}/delegations`,
          headers: mutation(person(ids.self)),
          payload: body,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await harness.app.inject({
          method: 'POST',
          url: `/v1/patients/${ids.selfPatient}/delegations`,
          headers: mutation(person(ids.self), ids.dependentPatient),
          payload: body,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await harness.app.inject({
          method: 'GET',
          url: '/v1/admin/guardianships',
          headers: {
            authorization: admin(ids.reviewer),
            'x-aal': '1',
            'x-purpose': 'guardianship_review',
          },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('rejects synthetic principals when seeded-synthetic mode is disabled', async () => {
    const isolated = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', SHIFAA_SYNTHETIC_MODE: 'false' }),
    });
    try {
      const response = await isolated.app.inject({
        method: 'GET',
        url: `/v1/patients/${ids.selfPatient}/relationships`,
        headers: { authorization: person(ids.self) },
      });
      expect(response.statusCode).toBe(503);
    } finally {
      await isolated.app.close();
    }
  });
});
