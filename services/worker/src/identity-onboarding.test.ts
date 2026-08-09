import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IdentityOnboardingWorker,
  projectEvent,
  type IdentityEvent,
} from './identity-onboarding.ts';

const event: IdentityEvent = {
  id: 'evt-1',
  type: 'identity.verification.changed',
  occurredAt: '2026-08-09T00:00:00.000Z',
  payload: {
    subject_id: 'subject-1',
    case_id: 'case-1',
    status: 'verified',
    identity_value: '29913321234567',
    emergency_contact: '+201000000000',
  },
};

test('event projection permits minimum fields and strips prohibited data', () => {
  assert.deepEqual(projectEvent(event).payload, {
    subject_id: 'subject-1',
    case_id: 'case-1',
    status: 'verified',
  });
});

test('receipt deduplication processes an event exactly once', async () => {
  const worker = new IdentityOnboardingWorker();
  let calls = 0;
  await worker.consume(event, async () => {
    calls += 1;
  });
  await worker.consume(event, async () => {
    calls += 1;
  });
  assert.equal(calls, 1);
});

test('bounded exponential retries enter dead-letter state', async () => {
  const worker = new IdentityOnboardingWorker(3, 100);
  const fail = async () => {
    throw new Error('synthetic failure');
  };
  const first = await worker.consume(event, fail, new Date('2026-08-09T00:00:00Z'));
  const second = await worker.consume(event, fail, new Date('2026-08-09T00:00:00Z'));
  const third = await worker.consume(event, fail, new Date('2026-08-09T00:00:00Z'));
  assert.equal(first.nextAttemptAt, '2026-08-09T00:00:00.100Z');
  assert.equal(second.nextAttemptAt, '2026-08-09T00:00:00.200Z');
  assert.equal(third.state, 'dead_letter');
});
