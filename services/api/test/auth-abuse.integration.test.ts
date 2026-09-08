import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

const password = 'Synthetic-Only-2026!';
const wrongPassword = 'Wrong-Synthetic-2026!';

function withoutRequestId(problem: Record<string, unknown>): Record<string, unknown> {
  const { request_id: _requestId, ...stable } = problem;
  return stable;
}

describe('SEC-005 pre-auth principal abuse controls', () => {
  it('limits registration by normalized HMAC principal across source IP and idempotency changes', async () => {
    let now = new Date('2026-09-08T12:00:00.000Z');
    const harness = await buildApp({ clock: { now: () => now } });
    const handle = 'sec005-register@synthetic.shifaa.test';

    try {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await harness.app.inject({
          method: 'POST',
          url: '/v1/auth/register',
          headers: { 'idempotency-key': `sec005-register-attempt-${attempt}` },
          remoteAddress: `198.51.100.${attempt}`,
          payload: {
            locale: 'en-EG',
            handle: attempt % 2 === 0 ? handle.toUpperCase() : handle,
            password,
          },
        });
        expect(response.statusCode).toBe(attempt === 1 ? 201 : 409);
      }

      const limited = await harness.app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        headers: { 'idempotency-key': 'sec005-register-attempt-6' },
        remoteAddress: '203.0.113.6',
        payload: { locale: 'en-EG', handle: handle.toUpperCase(), password },
      });

      expect(limited.statusCode).toBe(429);
      expect(limited.headers['retry-after']).toBeDefined();
      expect(limited.json()).toMatchObject({ code: 'rate-limited', status: 429 });
      expect(limited.body).not.toContain(handle);
      expect(
        harness.repository.audits.filter(
          (audit) => audit.action === 'identity.registration.created',
        ),
      ).toHaveLength(1);

      now = new Date(now.getTime() + 15 * 60_000);
      const afterWindow = await harness.app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        headers: { 'idempotency-key': 'sec005-register-after-window' },
        remoteAddress: '203.0.113.7',
        payload: { locale: 'en-EG', handle, password },
      });
      expect(afterWindow.statusCode).toBe(409);
    } finally {
      await harness.app.close();
    }
  });

  it('limits login per route-scoped principal and keeps existing and missing failures opaque', async () => {
    const harness = await buildApp();
    const existingHandle = 'sec005-login@synthetic.shifaa.test';
    const missingHandle = 'sec005-missing@synthetic.shifaa.test';

    try {
      const registration = await harness.app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        headers: { 'idempotency-key': 'sec005-login-registration' },
        remoteAddress: '198.51.100.100',
        payload: { locale: 'en-EG', handle: existingHandle, password },
      });
      expect(registration.statusCode).toBe(201);

      const failures = new Map<string, Record<string, unknown>>();
      for (const [label, handle] of [
        ['existing', existingHandle],
        ['missing', missingHandle],
      ] as const) {
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          const response = await harness.app.inject({
            method: 'POST',
            url: '/v1/auth/login',
            headers: { 'idempotency-key': `sec005-${label}-login-${attempt}` },
            remoteAddress: `192.0.2.${label === 'existing' ? attempt : attempt + 20}`,
            payload: {
              handle: attempt % 2 === 0 ? handle.toUpperCase() : handle,
              password: wrongPassword,
            },
          });
          expect(response.statusCode).toBe(401);
          if (attempt === 1) failures.set(label, withoutRequestId(response.json()));
        }

        const limited = await harness.app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          headers: { 'idempotency-key': `sec005-${label}-login-6` },
          remoteAddress: `203.0.113.${label === 'existing' ? 40 : 60}`,
          payload: { handle: handle.toUpperCase(), password: wrongPassword },
        });
        expect(limited.statusCode).toBe(429);
        expect(limited.headers['retry-after']).toBeDefined();
        expect(limited.json()).toMatchObject({ code: 'rate-limited', status: 429 });
        expect(limited.body).not.toContain(handle);
      }

      expect(failures.get('existing')).toEqual(failures.get('missing'));
    } finally {
      await harness.app.close();
    }
  });
});
