import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const patientId = 'f0100000-0000-4000-8000-000000000002';
const appointmentId = 'f0100000-0000-4000-8500-000000000001';

function headers(overrides: Record<string, string> = {}) {
  return {
    authorization: `Bearer synthetic-person:${patientId}`,
    'idempotency-key': 'f010-c22-message-key-001',
    'x-purpose': 'appointment.scheduling',
    'x-aal': '2',
    ...overrides,
  };
}

describe('Feature 010 appointment-context messages', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => Promise.all(apps.splice(0).map(({ app }) => app.close())));

  it('exposes authorized appointment-context message reads', async () => {
    const service = {
      listContextMessages: vi.fn(async () => ({
        data: [],
        meta: {
          nextCursor: null,
          lastUpdatedAt: '2030-04-05T08:10:00.000Z',
          stale: false,
        },
      })),
      sendContextMessage: vi.fn(),
    };
    const harness = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', SHIFAA_SYNTHETIC_MODE: 'true' }),
      feature010MessageService: service,
    });
    apps.push(harness);

    const result = await harness.app.inject({
      method: 'GET',
      url: `/v1/contexts/appointment/${appointmentId}/messages?limit=10`,
      headers: headers(),
    });

    expect(result.statusCode).toBe(200);
    expect(result.headers['x-request-id']).toEqual(expect.any(String));
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.headers['content-language']).toBe('ar-EG');
  });

  it('exposes body-only appointment-context message sends', async () => {
    const service = {
      listContextMessages: vi.fn(),
      sendContextMessage: vi.fn(async () => ({
        id: 'f0100000-0000-4000-8900-000000000001',
        contextType: 'appointment' as const,
        contextId: appointmentId,
        senderId: patientId,
        body: 'Synthetic appointment message.',
        sentAt: '2030-04-05T08:10:00.000Z',
      })),
    };
    const harness = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', SHIFAA_SYNTHETIC_MODE: 'true' }),
      feature010MessageService: service,
    });
    apps.push(harness);

    const result = await harness.app.inject({
      method: 'POST',
      url: `/v1/contexts/appointment/${appointmentId}/messages`,
      headers: headers(),
      payload: { body: 'Synthetic appointment message.' },
    });

    expect(result.statusCode).toBe(201);
    expect(result.headers['x-request-id']).toEqual(expect.any(String));
    expect(result.json()).toMatchObject({
      contextType: 'appointment',
      contextId: appointmentId,
      senderId: patientId,
      body: 'Synthetic appointment message.',
    });
    expect(result.headers['cache-control']).toBe('private, no-store');
  });

  it('rejects unsupported contexts and out-of-range pages', async () => {
    const service = { listContextMessages: vi.fn(), sendContextMessage: vi.fn() };
    const harness = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', SHIFAA_SYNTHETIC_MODE: 'true' }),
      feature010MessageService: service,
    });
    apps.push(harness);
    const requests = await Promise.all([
      harness.app.inject({
        method: 'GET',
        url: `/v1/contexts/encounter/${appointmentId}/messages`,
        headers: headers(),
      }),
      harness.app.inject({
        method: 'GET',
        url: `/v1/contexts/appointment/${appointmentId}/messages?limit=101`,
        headers: headers(),
      }),
    ]);

    expect(requests.map((response) => response.statusCode)).toEqual([422, 422]);
  });

  it.each([
    {},
    { body: '   ' },
    { body: 7 },
    { body: null },
    { body: 'Synthetic body.', attachment: null },
    { body: 'Synthetic body.', attachment: false },
    { body: 'Synthetic body.', attachment: true },
    { body: 'Synthetic body.', attachment: 0 },
    { body: 'Synthetic body.', attachment: 'file' },
    { body: 'Synthetic body.', attachment: [] },
    { body: 'Synthetic body.', unexpected: true },
  ])('rejects non-body send payloads before storage', async (payload) => {
    const service = { listContextMessages: vi.fn(), sendContextMessage: vi.fn() };
    const harness = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', SHIFAA_SYNTHETIC_MODE: 'true' }),
      feature010MessageService: service,
    });
    apps.push(harness);
    const response = await harness.app.inject({
      method: 'POST',
      url: `/v1/contexts/appointment/${appointmentId}/messages`,
      headers: headers(),
      payload,
    });

    expect(response.statusCode).toBe(422);
    expect(service.sendContextMessage).not.toHaveBeenCalled();
  });

  it('returns a redacted internal error for a malformed protected service response', async () => {
    const canary = 'synthetic-private-message-canary';
    const service = {
      listContextMessages: vi.fn(),
      sendContextMessage: vi.fn(async () => ({
        id: 'f0100000-0000-4000-8900-000000000001',
        contextType: 'appointment' as const,
        contextId: appointmentId,
        senderId: patientId,
        body: 'Synthetic message.',
        sentAt: '2030-04-05T08:10:00.000Z',
        bodyCiphertext: canary,
      })),
    };
    const harness = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', SHIFAA_SYNTHETIC_MODE: 'true' }),
      feature010MessageService: service,
    });
    apps.push(harness);
    const response = await harness.app.inject({
      method: 'POST',
      url: `/v1/contexts/appointment/${appointmentId}/messages`,
      headers: headers(),
      payload: { body: 'Synthetic message.' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain(canary);
    expect(response.json().code).toBe('internal-error');
  });

  it('requires AAL2 and a current purpose before sending', async () => {
    const service = { listContextMessages: vi.fn(), sendContextMessage: vi.fn() };
    const harness = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', SHIFAA_SYNTHETIC_MODE: 'true' }),
      feature010MessageService: service,
    });
    apps.push(harness);
    const lowAal = await harness.app.inject({
      method: 'POST',
      url: `/v1/contexts/appointment/${appointmentId}/messages`,
      headers: headers({ 'x-aal': '1' }),
      payload: { body: 'Synthetic body.' },
    });
    const noPurpose = await harness.app.inject({
      method: 'POST',
      url: `/v1/contexts/appointment/${appointmentId}/messages`,
      headers: headers({ 'x-purpose': '' }),
      payload: { body: 'Synthetic body.' },
    });

    expect(lowAal.statusCode).toBe(403);
    expect(lowAal.json().code).toBe('mfa-required');
    expect(noPurpose.statusCode).toBe(403);
    expect(noPurpose.json().code).toBe('purpose-required');
    expect(service.sendContextMessage).not.toHaveBeenCalled();
  });

  it.each([
    { code: '23505', message: 'idempotency key reused', expectedCode: 'idempotency-key-reused' },
    {
      code: '55000',
      message: 'participant interval is no longer active',
      expectedCode: 'state-transition-invalid',
    },
  ])('maps protected send conflicts to $expectedCode', async ({ code, message, expectedCode }) => {
    const service = {
      listContextMessages: vi.fn(),
      sendContextMessage: vi.fn(async () => {
        throw Object.assign(new Error(message), { code });
      }),
    };
    const harness = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', SHIFAA_SYNTHETIC_MODE: 'true' }),
      feature010MessageService: service,
    });
    apps.push(harness);
    const response = await harness.app.inject({
      method: 'POST',
      url: `/v1/contexts/appointment/${appointmentId}/messages`,
      headers: headers(),
      payload: { body: 'Synthetic message.' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe(expectedCode);
    expect(response.body).not.toContain(message);
  });
});
