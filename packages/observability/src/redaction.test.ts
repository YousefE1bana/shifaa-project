import assert from 'node:assert/strict';
import test from 'node:test';
import { findSentinels, metricLabels, redact, REDACTED, requestTelemetry } from './index.ts';

// Invalid month 13 makes this synthetic identity sentinel impossible as a real National ID.
const sentinels = [
  '29913321234567',
  'CorrectHorseBattery',
  '654321',
  'token-sentinel',
  'document-sentinel',
  'synthetic@example.invalid',
  '+201000000001',
];

test('recursive redaction removes identity, password, OTP, token and document sentinels', () => {
  const unsafe = {
    identity_value: sentinels[0],
    nested: [
      { password: sentinels[1] },
      { otp: sentinels[2] },
      { token: sentinels[3] },
      { document: { name: sentinels[4] } },
    ],
    message: `Bearer ${sentinels[3]} for 29913321234567 ${sentinels[5]} ${sentinels[6]}`,
    profile_id: 'profile-is-not-a-secret-key',
  };
  const safe = redact(unsafe);
  assert.deepEqual(findSentinels(safe, sentinels), []);
  assert.equal((safe as Record<string, unknown>).identity_value, REDACTED);
  assert.equal((safe as Record<string, unknown>).profile_id, 'profile-is-not-a-secret-key');
});

test('request telemetry has no full body and metrics reject high-cardinality labels', () => {
  const event = requestTelemetry({
    requestId: 'req-1',
    routeId: 'getMyProfile',
    method: 'GET',
    statusCode: 200,
    durationMs: 42,
    actorType: 'patient',
  });
  assert.equal('body' in event, false);
  assert.deepEqual(
    metricLabels({ route_id: 'getMyProfile', subject_id: 'subject-1', status_class: '2xx' }),
    { route_id: 'getMyProfile', status_class: '2xx' },
  );
});
