import { describe, expect, it, vi } from 'vitest';

import { AuditAdminClient, generatedAuditAdminOperationIds } from './audit-admin.js';

describe('generated Feature 008 API client', () => {
  it('exposes exactly the seven approved operation identifiers', () => {
    expect(generatedAuditAdminOperationIds).toHaveLength(7);
    expect(new Set(generatedAuditAdminOperationIds).size).toBe(7);
  });

  it('keeps admin purpose and internal service credentials on separate request paths', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    const client = new AuditAdminClient({
      baseUrl: 'https://synthetic.invalid',
      accessToken: 'admin-token',
      serviceCredential: 'service-token',
      fetch: fetcher,
    });
    await client.listAuditEvents({ limit: 25 }, 'security.audit.review');
    await client.exportAuditPartition(
      { export_batch_id: '83000000-0000-4000-8000-000000000001' },
      'synthetic-idempotency-key',
    );
    const adminHeaders = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    const serviceHeaders = new Headers(fetcher.mock.calls[1]?.[1]?.headers);
    expect(adminHeaders.get('Authorization')).toBe('Bearer admin-token');
    expect(adminHeaders.get('X-Purpose')).toBe('security.audit.review');
    expect(serviceHeaders.get('Authorization')).toBe('Bearer service-token');
    expect(serviceHeaders.get('Idempotency-Key')).toBe('synthetic-idempotency-key');
    expect(serviceHeaders.get('X-Purpose')).toBeNull();
  });
});
