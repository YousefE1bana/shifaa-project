import { describe, expect, it, vi } from 'vitest';

import {
  ClinicSchedulingClient,
  generatedClinicSchedulingOperationIds,
} from './clinic-scheduling.js';

describe('generated Feature 009 API client', () => {
  it('exposes exactly the 18 approved operation identifiers', () => {
    expect(generatedClinicSchedulingOperationIds).toHaveLength(18);
    expect(new Set(generatedClinicSchedulingOperationIds).size).toBe(18);
  });

  it('sends version/idempotency headers and keeps delay on its dedicated path', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    const client = new ClinicSchedulingClient({
      baseUrl: 'https://synthetic.invalid',
      accessToken: 'synthetic-token',
      fetch: fetcher,
    });
    await client.updateSchedule(
      '90000000-0000-4000-8000-000000000001',
      '96000000-0000-4000-8000-000000000001',
      { status: 'active' },
      4,
      'synthetic-idempotency-key',
    );
    await client.sendDoctorDelay(
      '90000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      {
        civilDate: '2026-04-15',
        delayMinutes: 30,
        templateCode: 'synthetic-delay',
        reason: 'synthetic',
      },
      'synthetic-idempotency-key-2',
    );

    const updateRequest = fetcher.mock.calls[0]?.[1];
    const delayRequest = fetcher.mock.calls[1]?.[1];
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://synthetic.invalid/v1/clinics/90000000-0000-4000-8000-000000000001/schedules/96000000-0000-4000-8000-000000000001',
    );
    expect(new Headers(updateRequest?.headers).get('If-Match')).toBe('"4"');
    expect(new Headers(updateRequest?.headers).get('Idempotency-Key')).toBe(
      'synthetic-idempotency-key',
    );
    expect(fetcher.mock.calls[1]?.[0]).toContain(
      '/doctors/91000000-0000-4000-8000-000000000001/delay',
    );
    expect(new Headers(delayRequest?.headers).get('Idempotency-Key')).toBe(
      'synthetic-idempotency-key-2',
    );
  });

  it('does not forward inherited authorization to public discovery calls', async () => {
    let requestedHeaders = new Headers();
    const client = new ClinicSchedulingClient({
      baseUrl: 'https://synthetic.invalid',
      defaultHeaders: { Authorization: 'Bearer must-not-leak' },
      fetch: async (_input, init) => {
        requestedHeaders = new Headers(init?.headers);
        return new Response('{}', { status: 200 });
      },
    });
    await client.searchDoctors();
    await client.listDoctorAvailability(
      '90000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      { fromDate: '2030-01-01', toDate: '2030-01-31' },
    );
    expect(requestedHeaders.get('Authorization')).toBeNull();
  });
});
