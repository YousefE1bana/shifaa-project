import { describe, expect, it } from 'vitest';

import { adminRoles } from '@shifaa/core';
import { buildApp } from '../src/app.js';

const proposer = '30000000-0000-4000-8000-000000000011';
const decider = '30000000-0000-4000-8000-000000000012';
const target = '30000000-0000-4000-8000-000000000013';
const token = (role: string, person: string) => `Bearer synthetic-admin:${role}:${person}`;
const governanceHeaders = (person: string, key?: string) => ({
  authorization: token('super_admin', person),
  'x-aal': '2',
  'x-purpose': 'role_governance',
  ...(key ? { 'idempotency-key': key } : {}),
});

describe('canonical administrative role governance', () => {
  it('has no inheritance: only super_admin can list or mutate role grants', async () => {
    const { app } = await buildApp();
    try {
      for (const role of adminRoles) {
        const list = await app.inject({
          method: 'GET',
          url: '/v1/admin/role-grants',
          headers: { authorization: token(role, proposer) },
        });
        expect(list.statusCode, role).toBe(role === 'super_admin' ? 200 : 403);
        const proposal = await app.inject({
          method: 'POST',
          url: '/v1/admin/role-grants',
          headers: {
            authorization: token(role, proposer),
            'x-aal': '2',
            'x-purpose': 'role_governance',
            'idempotency-key': `role-matrix-${role}-0001`,
          },
          payload: {
            person_id: target,
            role_code: 'facility_approver',
            valid_from: '2026-08-11T00:00:00.000Z',
            reason: 'Synthetic role parity check',
          },
        });
        expect(proposal.statusCode, role).toBe(role === 'super_admin' ? 201 : 403);
      }
    } finally {
      await app.close();
    }
  });

  it('enforces independent grant and revocation actors, versions, and replay', async () => {
    const { app, facilityService } = await buildApp();
    try {
      const proposalKey = 'grant-proposal-independent-0001';
      const proposed = await app.inject({
        method: 'POST',
        url: '/v1/admin/role-grants',
        headers: governanceHeaders(proposer, proposalKey),
        payload: {
          person_id: target,
          role_code: 'facility_approver',
          valid_from: '2026-08-11T00:00:00.000Z',
          reason: 'Synthetic independent grant',
        },
      });
      expect(proposed.statusCode).toBe(201);
      const grant = proposed.json();
      for (const person of [proposer, target]) {
        const denied = await app.inject({
          method: 'POST',
          url: `/v1/admin/role-grants/${grant.id}/decision`,
          headers: { ...governanceHeaders(person, `grant-self-${person}-0001`), 'if-match': '"1"' },
          payload: { decision: 'approve', reason: 'Must be independent' },
        });
        expect(denied.statusCode).toBe(403);
      }
      const decisionRequest = {
        method: 'POST' as const,
        url: `/v1/admin/role-grants/${grant.id}/decision`,
        headers: {
          ...governanceHeaders(decider, 'grant-decision-independent-0001'),
          'if-match': '"1"',
        },
        payload: { decision: 'approve', reason: 'Independent synthetic decision' },
      };
      const decision = await app.inject(decisionRequest);
      expect(decision.statusCode).toBe(200);
      expect(decision.json().status).toBe('active');
      expect((await app.inject(decisionRequest)).json()).toEqual(decision.json());
      const changedReplay = await app.inject({
        ...decisionRequest,
        payload: { ...decisionRequest.payload, decision: 'reject' },
      });
      expect(changedReplay.statusCode).toBe(409);
      const stale = await app.inject({
        method: 'POST',
        url: `/v1/admin/role-grants/${grant.id}/revocation-requests`,
        headers: {
          ...governanceHeaders(decider, 'revocation-stale-version-0001'),
          'if-match': '"1"',
        },
        payload: { reason: 'Stale synthetic revocation' },
      });
      expect(stale.statusCode).toBe(409);
      const revocation = await app.inject({
        method: 'POST',
        url: `/v1/admin/role-grants/${grant.id}/revocation-requests`,
        headers: { ...governanceHeaders(decider, 'revocation-proposal-0001'), 'if-match': '"2"' },
        payload: { reason: 'Independent synthetic revocation' },
      });
      expect(revocation.statusCode).toBe(201);
      const request = revocation.json();
      const selfDecision = await app.inject({
        method: 'POST',
        url: `/v1/admin/role-grant-revocations/${request.id}/decision`,
        headers: {
          ...governanceHeaders(decider, 'revocation-self-decision-0001'),
          'if-match': '"1"',
        },
        payload: { decision: 'approve', reason: 'Self decision must fail' },
      });
      expect(selfDecision.statusCode).toBe(403);
      const revoked = await app.inject({
        method: 'POST',
        url: `/v1/admin/role-grant-revocations/${request.id}/decision`,
        headers: { ...governanceHeaders(proposer, 'revocation-decision-0001'), 'if-match': '"1"' },
        payload: { decision: 'approve', reason: 'Independent revocation decision' },
      });
      expect(revoked.statusCode).toBe(200);
      expect(revoked.json().status).toBe('approved');
      expect(facilityService.grants.get(grant.id)?.status).toBe('revoked');
    } finally {
      await app.close();
    }
  });
});
