import assert from 'node:assert/strict';
import test from 'node:test';

import { FacilityOnboardingService } from '../../services/api/src/modules/facility-onboarding/service.ts';

const actor = (personId: string) => ({
  personId,
  principal: `synthetic-admin:super_admin:${personId}`,
  adminRole: 'super_admin' as const,
  aal: 2 as const,
  purpose: 'role_governance',
});

test('independent actors grant and revoke while proposal alone grants nothing', () => {
  const service = new FacilityOnboardingService(() => new Date('2026-08-11T00:00:00Z'));
  const proposer = actor('30000000-0000-4000-8000-000000000011');
  const decider = actor('30000000-0000-4000-8000-000000000012');
  const target = '30000000-0000-4000-8000-000000000013';
  const grant = service.proposeGrant(proposer, {
    person_id: target,
    role_code: 'facility_approver',
    valid_from: '2026-08-11T00:00:00Z',
    reason: 'Synthetic proposal',
  });
  assert.equal(grant.status, 'pending');
  assert.throws(() =>
    service.decideGrant(proposer, grant.id, { decision: 'approve', reason: 'self' }, 1),
  );
  assert.equal(
    service.decideGrant(decider, grant.id, { decision: 'approve', reason: 'independent' }, 1)
      .status,
    'active',
  );
  const revocation = service.proposeRevocation(
    decider,
    grant.id,
    { reason: 'Synthetic revoke' },
    2,
  );
  assert.throws(() =>
    service.decideRevocation(decider, revocation.id, { decision: 'approve', reason: 'self' }, 1),
  );
  assert.equal(
    service.decideRevocation(
      proposer,
      revocation.id,
      { decision: 'approve', reason: 'independent' },
      1,
    ).status,
    'approved',
  );
  assert.equal(service.grants.get(grant.id)?.status, 'revoked');
  assert.equal(
    service.audit.filter((row) => String(row.action).startsWith('admin_role.')).length,
    4,
  );
  assert.equal(
    service.outbox.filter((row) => String(row.action).startsWith('admin_role.')).length,
    4,
  );
});
