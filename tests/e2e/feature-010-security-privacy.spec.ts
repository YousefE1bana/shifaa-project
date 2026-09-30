import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../../services/api/src/config.ts';
import { buildApp } from '../../services/api/src/app.ts';
import { ApiPolicyError } from '../../services/api/src/modules/identity-onboarding/errors.ts';
import { Feature010RealtimeHintProcessor } from '../../services/worker/src/feature-010-realtime.ts';
import {
  feature010MetricLabels,
  feature010SafeProblem,
  feature010Telemetry,
  withFeature010Telemetry,
} from '../../packages/observability/src/feature-010.ts';

const canaries = [
  'synthetic-private-note-canary',
  'synthetic-referral-reason-canary',
  'synthetic-message-plaintext-canary',
  'synthetic-ciphertext-canary',
  'synthetic-session-token-canary',
  'synthetic-patient-payload-canary',
  'synthetic-patient-visible-note-canary',
  'synthetic-encounter-type-canary',
];
const encounterId = '72000000-0000-4000-8000-000000000001';
const patientId = '71000000-0000-4000-8000-000000000001';
const personId = '70000000-0000-4000-8000-000000000001';

type CallCounts = Record<string, number>;

function boundaryService(methods: readonly string[], calls: CallCounts, failure: ApiPolicyError) {
  return new Proxy(
    {},
    {
      get: (_target, method: string) => {
        if (!methods.includes(method)) return undefined;
        return async () => {
          calls[method] = (calls[method] ?? 0) + 1;
          throw failure;
        };
      },
    },
  );
}

async function createApi(failure: ApiPolicyError, calls: CallCounts) {
  const config = loadConfig({ NODE_ENV: 'test' });
  return buildApp({
    config: { ...config, syntheticMode: true },
    feature010EncounterService: boundaryService(
      [
        'getEncounter',
        'createEncounter',
        'updateEncounter',
        'signEncounterNote',
        'completeEncounter',
      ],
      calls,
      failure,
    ) as never,
    feature010ReferralService: boundaryService(
      ['createReferral', 'listReferrals', 'acceptReferral'],
      calls,
      failure,
    ) as never,
    feature010MessageService: boundaryService(
      ['listContextMessages', 'sendContextMessage'],
      calls,
      failure,
    ) as never,
  });
}

function actorHeaders() {
  return {
    authorization: `Bearer synthetic-person:${personId}`,
    'x-aal': '2',
    'x-purpose': 'treatment',
    'accept-language': 'en-EG',
  };
}

test('F010 registered route problems suppress policy detail across all three domains', async () => {
  const calls: CallCounts = {};
  const canaryMessage = canaries.join('|');
  const harness = await createApi(
    new ApiPolicyError('not-found', 404, `Resource unavailable: ${canaryMessage}`),
    calls,
  );
  try {
    const requests = [
      `/v1/encounters/${encounterId}`,
      '/v1/referrals',
      `/v1/contexts/appointment/${encounterId}/messages`,
    ];
    const responses = await Promise.all(
      requests.map((url) => harness.app.inject({ method: 'GET', url, headers: actorHeaders() })),
    );
    for (const response of responses) {
      assert.equal(response.statusCode, 404);
      assert.equal(response.headers['content-type']?.includes('application/problem+json'), true);
      for (const canary of canaries) assert.equal(response.body.includes(canary), false);
    }
    const problems = responses.map(
      (response) => response.json() as { instance: string; detail: string },
    );
    assert.ok(problems.every(({ instance }) => instance.length > 0));
    assert.ok(problems.every(({ detail }) => detail.length > 0));
    assert.deepEqual(calls, { getEncounter: 1, listReferrals: 1, listContextMessages: 1 });
  } finally {
    await harness.app.close();
  }
});

test('F010 message problem instance uses registered route template and drops query canaries', async () => {
  const calls: CallCounts = {};
  const harness = await createApi(new ApiPolicyError('forbidden', 403, 'Not allowed.'), calls);
  try {
    const queryCanary = canaries.join('|');
    const response = await harness.app.inject({
      method: 'GET',
      url: `/v1/contexts/appointment/${encounterId}/messages?cursor=${encodeURIComponent(queryCanary)}`,
      headers: actorHeaders(),
    });
    const problem = response.json() as { status: number; instance: string };
    assert.equal(problem.status, 403);
    for (const canary of canaries) assert.equal(response.body.includes(canary), false);
    assert.equal(problem.instance, '/v1/contexts/:contextType/:contextId/messages');
    assert.deepEqual(calls, { listContextMessages: 1 });
  } finally {
    await harness.app.close();
  }
});

test('F010 rejects missing identity and forged message context before any domain service call', async () => {
  const calls: CallCounts = {};
  const harness = await createApi(new ApiPolicyError('forbidden', 403, 'Not permitted.'), calls);
  try {
    const responses = await Promise.all([
      harness.app.inject({ method: 'GET', url: `/v1/encounters/${encounterId}` }),
      harness.app.inject({
        method: 'POST',
        url: `/v1/encounters/${encounterId}/referrals`,
        headers: actorHeaders(),
        payload: { targetSpecialty: 'synthetic', reasonSummary: canaries[1] },
      }),
      harness.app.inject({
        method: 'POST',
        url: `/v1/contexts/sms/${encounterId}/messages`,
        headers: { ...actorHeaders(), 'idempotency-key': 'synthetic-key-000001' },
        payload: { body: canaries[2], attachment: null },
      }),
    ]);
    assert.deepEqual(
      responses.map(({ statusCode }) => statusCode),
      [401, 422, 422],
    );
    for (const response of responses) {
      for (const canary of canaries) assert.equal(response.body.includes(canary), false);
    }
    assert.deepEqual(calls, {});
  } finally {
    await harness.app.close();
  }
});

test('F010 stale encounter, revoked referral grant, and completed message context stay denied at service boundary', async () => {
  for (const denial of [
    {
      route: `/v1/encounters/${encounterId}`,
      method: 'getEncounter',
      code: 'not-found',
      status: 404,
    },
    { route: '/v1/referrals', method: 'listReferrals', code: 'forbidden', status: 403 },
    {
      route: `/v1/contexts/appointment/${encounterId}/messages`,
      method: 'listContextMessages',
      code: 'forbidden',
      status: 403,
    },
  ]) {
    const calls: CallCounts = {};
    const canaryMessage = `Denied with ${canaries.join('|')}`;
    const harness = await createApi(
      new ApiPolicyError(denial.code, denial.status, canaryMessage),
      calls,
    );
    try {
      const response = await harness.app.inject({
        method: 'GET',
        url: denial.route,
        headers: actorHeaders(),
      });
      assert.equal(response.statusCode, denial.status);
      for (const canary of canaries) assert.equal(response.body.includes(canary), false);
      assert.equal(calls[denial.method], 1);
    } finally {
      await harness.app.close();
    }
  }
});

test('F010 telemetry drops hostile metadata and metrics retain only bounded dimensions', () => {
  const hostile = {
    requestId: '70000000-0000-4000-8000-000000000002',
    traceId: '0123456789abcdef0123456789abcdef',
    operation: 'sendContextMessage',
    resultClass: 'denied',
    statusCode: 403,
    durationMs: 250,
    body: canaries[2],
    privateNote: canaries[0],
    referralReason: canaries[1],
    ciphertext: canaries[3],
    patientPayload: canaries[5],
    encounterType: canaries[7],
    patientId,
    encounterId,
    url: `/v1/contexts/appointment/${encounterId}/messages?body=${canaries[2]}`,
    authorization: `Bearer ${canaries[4]}`,
    error: new Error(canaries[6]),
  };
  const event = feature010Telemetry(hostile as never);
  const labels = feature010MetricLabels(event);

  for (const canary of canaries) assert.equal(JSON.stringify(event).includes(canary), false);
  assert.deepEqual(event, {
    event: 'feature_010.api.request',
    requestId: '70000000-0000-4000-8000-000000000002',
    traceId: '0123456789abcdef0123456789abcdef',
    operation: 'sendContextMessage',
    resultClass: 'denied',
    statusClass: '4xx',
    latencyBucket: 'lt_400ms',
  });
  assert.deepEqual(labels, {
    operation: 'sendContextMessage',
    result_class: 'denied',
    status_class: '4xx',
    latency_bucket: 'lt_400ms',
  });
  assert.equal(JSON.stringify(labels).includes(encounterId), false);
  assert.equal(JSON.stringify(labels).includes(event.requestId), false);
  assert.equal(JSON.stringify(labels).includes(event.traceId!), false);
});

test('F010 telemetry rejects unknown operations, outcomes, statuses, and unbounded durations', () => {
  const valid = {
    requestId: '70000000-0000-4000-8000-000000000003',
    operation: 'getEncounter',
    resultClass: 'success',
    statusCode: 200,
  } as const;
  assert.throws(() => feature010Telemetry({ ...valid, operation: 'arbitraryRoute' } as never));
  assert.throws(() => feature010Telemetry({ ...valid, resultClass: 'unknown' } as never));
  assert.throws(() => feature010Telemetry({ ...valid, statusCode: 799 } as never));
  assert.throws(() =>
    feature010Telemetry({ ...valid, durationMs: Number.POSITIVE_INFINITY } as never),
  );
});

test('F010 logger receives only closed telemetry for success, denial, and conflict paths', async () => {
  const captured: unknown[] = [];
  const request = {
    id: '70000000-0000-4000-8000-000000000004',
    log: { info: (event: unknown) => captured.push(event) },
  };
  await withFeature010Telemetry(request, { statusCode: 201 }, 'createReferral', async () => 'ok');
  await assert.rejects(
    withFeature010Telemetry(request, { statusCode: 403 }, 'listReferrals', async () => {
      throw Object.assign(new Error(canaries.join('|')), {
        status: 403,
        headers: { authorization: canaries[4] },
        detail: canaries[0],
      });
    }),
  );
  await assert.rejects(
    withFeature010Telemetry(request, { statusCode: 409 }, 'acceptReferral', async () => {
      throw Object.assign(new Error(canaries.join('|')), { status: 409, body: canaries[2] });
    }),
  );

  assert.equal(captured.length, 3);
  assert.deepEqual(
    captured.map((entry) => (entry as { resultClass: string }).resultClass),
    ['success', 'denied', 'conflict'],
  );
  for (const event of captured) {
    const json = JSON.stringify(event);
    for (const canary of canaries) assert.equal(json.includes(canary), false);
    assert.deepEqual(Object.keys(event as object).sort(), [
      'event',
      'latencyBucket',
      'operation',
      'requestId',
      'resultClass',
      'statusClass',
    ]);
  }
});

test('F010 safe problems replace hostile codes and headers and bound rate-limit retry hints', () => {
  const hostile = feature010SafeProblem(canaries[0], 403, 'en', canaries[4]);
  assert.equal(hostile.code, 'forbidden');
  assert.equal(hostile.status, 403);
  assert.equal(hostile.detail.includes(canaries[0]), false);
  assert.equal('retryAfter' in hostile, false);

  const rateLimited = feature010SafeProblem('rate-limited', 429, 'en', '60');
  assert.equal(rateLimited.code, 'rate-limited');
  assert.equal(rateLimited.retryAfter, '60');
  for (const retryAfter of ['-1', '86401', '1e3', canaries[4], '01']) {
    assert.equal(
      'retryAfter' in feature010SafeProblem('rate-limited', 429, 'en', retryAfter),
      false,
    );
  }
  assert.equal(feature010SafeProblem('forbidden', 799, 'en').status, 500);
});

test('C23 realtime publish, retry, and dead-letter captures exclude hostile marker and sink data', async () => {
  const marker = {
    eventId: '70000000-0000-4000-8000-000000000010',
    eventType: 'clinical.context_message.created.v1' as const,
    aggregateType: 'context_message' as const,
    aggregateId: '70000000-0000-4000-8000-000000000011',
    aggregateVersion: 1,
    contextId: '70000000-0000-4000-8000-000000000012',
    attemptCount: 1,
    leaseExpiresAt: '2026-09-30T08:00:30.000Z',
    bodyCiphertext: canaries[3],
    patientPayload: canaries[5],
  };
  const captures: unknown[] = [];
  for (const scenario of ['delivered', 'retry', 'dead_letter'] as const) {
    const completions: unknown[] = [];
    const hints: unknown[] = [];
    let claimed = false;
    const processor = new Feature010RealtimeHintProcessor(
      {
        claimNext: async () => {
          if (claimed) return null;
          claimed = true;
          return scenario === 'dead_letter'
            ? ({ ...marker, contextId: null } as never)
            : (marker as never);
        },
        completeClaim: async (completion) => {
          completions.push(completion);
          return true;
        },
      },
      {
        publish: async (hint) => {
          hints.push(hint);
          if (scenario === 'retry') throw new Error(canaries.join('|'));
        },
      },
      'feature-010-privacy-test',
      () => new Date('2026-09-30T08:00:00.000Z'),
    );
    assert.equal(await processor.processNext(), scenario);
    captures.push({ scenario, hints, completions });
  }

  const serialized = JSON.stringify(captures);
  for (const canary of canaries) assert.equal(serialized.includes(canary), false);
  assert.deepEqual(
    captures.map(
      (capture) => (capture as { completions: { outcome: string }[] }).completions[0]?.outcome,
    ),
    ['delivered', 'retry', 'dead_letter'],
  );
});
