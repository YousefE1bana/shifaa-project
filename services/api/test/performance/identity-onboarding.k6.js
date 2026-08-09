import http from 'k6/http';
import { check, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const readDuration = new Trend('identity_read_duration', true);
const mutationDuration = new Trend('identity_mutation_duration', true);
const journeyFailures = new Rate('identity_journey_failures');

export const options = {
  scenarios: {
    identity_onboarding: {
      executor: 'per-vu-iterations',
      vus: 100,
      iterations: 1,
      maxDuration: '3m',
    },
  },
  thresholds: {
    checks: ['rate>=0.99'],
    identity_journey_failures: ['rate<0.01'],
    identity_read_duration: ['p(95)<400'],
    identity_mutation_duration: ['p(95)<800'],
  },
};

const baseUrl = (__ENV.SHIFAA_BASE_URL || 'http://127.0.0.1:3000/v1').replace(/\/$/, '');
const syntheticOtp = __ENV.SHIFAA_SYNTHETIC_OTP || '246810';

function jsonHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Accept-Language': 'ar-EG',
    ...extra,
  };
}

function record(response, kind) {
  (kind === 'read' ? readDuration : mutationDuration).add(response.timings.duration);
  const ok = check(response, {
    [`${kind} returned an expected status`]: (result) =>
      result.status >= 200 && result.status < 300,
  });
  journeyFailures.add(!ok);
  return ok;
}

export default function identityOnboardingJourney() {
  const runId = `${__VU}-${__ITER}-${Date.now()}`;
  const password = `Synthetic!${runId}Aa9`;
  const handle = `load-${runId}@example.test`;
  let token;

  group('register and authenticate', () => {
    const register = http.post(
      `${baseUrl}/auth/register`,
      JSON.stringify({ locale: 'ar-EG', handle, password }),
      {
        headers: jsonHeaders({ 'Idempotency-Key': `register-${runId}` }),
        tags: { kind: 'mutation', operation: 'registerPerson' },
      },
    );
    if (!record(register, 'mutation')) return;

    const result = register.json();
    if (result.kind === 'session') {
      token = result.access_token;
      return;
    }

    const verify = http.post(
      `${baseUrl}/auth/otp/verify`,
      JSON.stringify({ challenge_id: result.challenge_id, code: syntheticOtp }),
      {
        headers: jsonHeaders({ 'Idempotency-Key': `verify-${runId}` }),
        tags: { kind: 'mutation', operation: 'verifyOtp' },
      },
    );
    if (record(verify, 'mutation')) token = verify.json('access_token');
  });

  if (!token) {
    journeyFailures.add(true);
    return;
  }

  group('read and update profile', () => {
    const authorization = { Authorization: `Bearer ${token}` };
    const profile = http.get(`${baseUrl}/people/me`, {
      headers: jsonHeaders(authorization),
      tags: { kind: 'read', operation: 'getMyProfile' },
    });
    if (!record(profile, 'read')) return;

    const version = profile.json('version');
    const update = http.patch(
      `${baseUrl}/people/me`,
      JSON.stringify({ display_name: `Synthetic ${__VU}`, preferred_locale: 'ar-EG' }),
      {
        headers: jsonHeaders({
          ...authorization,
          'Idempotency-Key': `profile-${runId}`,
          'If-Match': `"${version}"`,
        }),
        tags: { kind: 'mutation', operation: 'updateMyProfile' },
      },
    );
    record(update, 'mutation');
  });

  group('read current privacy notice', () => {
    const notice = http.get(`${baseUrl}/privacy/notices/current`, {
      headers: jsonHeaders(),
      tags: { kind: 'read', operation: 'getPrivacyNotice' },
    });
    record(notice, 'read');
  });
}

export function handleSummary(data) {
  const thresholds = Object.fromEntries(
    Object.entries(data.metrics)
      .filter(([, metric]) => metric.thresholds)
      .map(([name, metric]) => [name, metric.thresholds]),
  );
  const evidence = {
    schema: 'shifaa-performance-evidence:v1',
    generated_at: new Date().toISOString(),
    target: baseUrl,
    sessions: 100,
    slo_ms: { read_p95: 400, mutation_p95: 800 },
    observed_ms: {
      read_p95: data.metrics.identity_read_duration?.values?.['p(95)'] ?? null,
      mutation_p95: data.metrics.identity_mutation_duration?.values?.['p(95)'] ?? null,
    },
    thresholds,
  };
  return {
    'specs/001-identity-onboarding/evidence/performance.json': JSON.stringify(evidence, null, 2),
    stdout: `Identity onboarding performance evidence: ${JSON.stringify(evidence.observed_ms)}\n`,
  };
}
