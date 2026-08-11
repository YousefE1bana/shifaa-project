import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FacilityEventWorker,
  projectFacilityEvent,
  type FacilityEvent,
} from './facility-onboarding.ts';
const event: FacilityEvent = {
  id: 'evt-003',
  type: 'facility.changed',
  occurredAt: '2026-08-11T00:00:00Z',
  payload: {
    facility_id: 'facility',
    facility_type: 'clinic',
    status: 'active',
    license_number: 'SENSITIVE',
    document: 'SENSITIVE',
    address: 'SENSITIVE',
    reason_code: { document: 'NESTED-SENSITIVE', detail: { token: 'TOKEN-SENSITIVE' } },
  },
};
test('projects only minimum fields and deduplicates receipts', async () => {
  assert.deepEqual(projectFacilityEvent(event).payload, {
    facility_id: 'facility',
    facility_type: 'clinic',
    status: 'active',
    reason_code: { document: '[REDACTED]', detail: { token: '[REDACTED]' } },
  });
  const worker = new FacilityEventWorker();
  let calls = 0;
  await worker.consume(event, async () => {
    calls++;
  });
  await worker.consume(event, async () => {
    calls++;
  });
  assert.equal(calls, 1);
  assert.doesNotMatch(
    JSON.stringify(projectFacilityEvent(event)),
    /NESTED-SENSITIVE|TOKEN-SENSITIVE/,
  );
});
test('coalesces concurrent same-id deliveries before invoking the handler', async () => {
  const worker = new FacilityEventWorker();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const first = worker.consume(event, async () => {
    calls++;
    await gate;
  });
  const second = worker.consume(event, async () => {
    calls++;
  });
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
});

test('does not spread unexpected envelope properties', () => {
  const poisoned = { ...event, email: 'SENSITIVE' } as FacilityEvent & { email: string };
  assert.equal('email' in projectFacilityEvent(poisoned), false);
});
