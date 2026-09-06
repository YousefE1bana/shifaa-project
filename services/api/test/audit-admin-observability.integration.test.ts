import Fastify, { type FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AuditAdminActor,
  AuditExportAccepted,
  AuditExportServiceActor,
} from '../src/modules/audit-admin/types.js';
import { ApiPolicyError } from '../src/modules/identity-onboarding/errors.js';
import {
  registerAuditAdminRoutes,
  type AuditAdminRouteDependencies,
} from '../src/routes/audit-admin.js';
import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';

const eventId = '82000000-0000-4000-8000-000000000001';
const batchId = '83000000-0000-4000-8000-000000000001';
const safeEvent = {
  event_id: eventId,
  occurred_at: '2026-08-31T23:59:59.000Z',
  request_id: '84000000-0000-4000-8000-000000000004',
  trace_id: 'trace-008-redacted-safe',
  actor_person_id: null,
  authentication_aal: 2 as const,
  facility_id: null,
  patient_id: null,
  purpose_code: 'security.audit.review',
  action_code: 'audit.export.requested',
  resource_type: 'audit_export',
  resource_id: batchId,
  resource_version: 1,
  outcome: 'success' as const,
  reason_code: null,
  source_ip_prefix: null,
  user_agent_class: 'service' as const,
  chain: {
    version: 1 as const,
    partition: '2026-08-01',
    sequence: 1,
    previous_hash: '0'.repeat(64),
    event_hash: '1'.repeat(64),
    verification: 'verified' as const,
  },
};

describe('Feature 008 admin and export API integration', () => {
  let app: ReturnType<typeof Fastify>;
  let dependencies: ReturnType<typeof routeDependencies>;

  beforeEach(async () => {
    dependencies = routeDependencies();
    app = Fastify({ genReqId: () => '84000000-0000-4000-8000-000000000099' });
    installIdentityErrorHandler(app);
    await registerAuditAdminRoutes(app, dependencies);
  });

  afterEach(async () => app.close());

  it('AC-01 returns an RFC 9457 private gate problem while metrics remain inactive', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/dashboard-summary',
      headers: adminHeaders(),
    });
    expect(response.statusCode).toBe(503);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-request-id']).toBe('84000000-0000-4000-8000-000000000099');
    expect(response.json()).toMatchObject({
      code: 'legal-gate-disabled',
      request_id: '84000000-0000-4000-8000-000000000099',
      errors: [],
    });
  });

  it.each([
    [{}, 401],
    [
      {
        authorization: authorizationFor('synthetic-super-admin'),
        'x-aal': '1',
        'x-purpose': 'security.audit.review',
      },
      403,
    ],
    [{ authorization: authorizationFor('synthetic-super-admin'), 'x-aal': '2' }, 428],
    [
      {
        authorization: authorizationFor('synthetic-dpo'),
        'x-aal': '2',
        'x-purpose': 'security.audit.review',
      },
      403,
    ],
  ])('AC-03 denies missing auth, AAL2, purpose, or exact admin role', async (headers, status) => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/events',
      headers,
    });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ request_id: expect.any(String), errors: [] });
  });

  it('AC-04 passes bounded filters and emits only the redacted cursor page', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/admin/audit/events?action=audit.export.requested&limit=25&cursor=${'c'.repeat(16)}`,
      headers: adminHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.json()).toEqual({ data: [safeEvent], meta: { next_cursor: null } });
    expect(response.body).not.toMatch(/raw_metadata|SENTINEL-PHI|signed_url|credential/i);
    expect(dependencies.adminService.listAuditEvents).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'security.audit.review', aal: 2 }),
      { action: 'audit.export.requested', limit: 25, cursor: 'c'.repeat(16) },
    );
  });

  it('AC-05 collapses concurrent identical export requests and rejects changed-body reuse', async () => {
    const request = (partitionStart: string) =>
      app.inject({
        method: 'POST',
        url: '/v1/admin/audit/exports',
        headers: { ...adminHeaders(), 'idempotency-key': 'synthetic-route-export-key-0001' },
        payload: {
          partition_start: partitionStart,
          partition_end_exclusive: '2026-08-01',
        },
      });
    const [first, replay] = await Promise.all([request('2026-05-01'), request('2026-05-01')]);
    expect(first.statusCode).toBe(202);
    expect(replay.json()).toEqual(first.json());
    expect(dependencies.effects()).toBe(1);
    const changed = await request('2026-06-01');
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toMatchObject({ code: 'idempotency-key-reused' });
    expect(dependencies.effects()).toBe(1);
  });

  it('AC-06/07 fails closed on internal tamper and adapter failure without response leakage', async () => {
    const tampered = await app.inject({
      method: 'POST',
      url: '/v1/internal/audit/exports',
      headers: serviceHeaders('synthetic-internal-route-key-tamper'),
      payload: { export_batch_id: '83000000-0000-4000-8000-000000000099' },
    });
    expect(tampered.statusCode).toBe(409);
    expect(tampered.json()).toMatchObject({ code: 'audit-integrity-failed' });
    expect(tampered.body).not.toMatch(/bytes|digest_value|proof_value|credential/i);

    const unavailable = await app.inject({
      method: 'POST',
      url: '/v1/internal/audit/exports',
      headers: serviceHeaders('synthetic-internal-route-key-failure'),
      payload: { export_batch_id: '83000000-0000-4000-8000-000000000098' },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({ code: 'service-unavailable' });
  });
});

function routeDependencies(): AuditAdminRouteDependencies & { effects(): number } {
  const exports = new Map<string, { body: string; promise: Promise<AuditExportAccepted> }>();
  let effects = 0;
  const requireAudit = (actor: AuditAdminActor) => {
    if (!actor.principal)
      throw new ApiPolicyError('authentication-required', 401, 'authentication-required');
    if (actor.aal !== 2) throw new ApiPolicyError('mfa-required', 403, 'mfa-required');
    if (actor.purpose !== 'security.audit.review')
      throw new ApiPolicyError('purpose-required', 428, 'purpose-required');
    if (actor.principal !== 'synthetic-super-admin')
      throw new ApiPolicyError('forbidden', 403, 'forbidden');
  };
  const adminService = {
    getAdminSummary: vi.fn(async (actor: AuditAdminActor) => {
      if (!actor.principal)
        throw new ApiPolicyError('authentication-required', 401, 'authentication-required');
      throw new ApiPolicyError('legal-gate-disabled', 503, 'legal-gate-disabled');
    }),
    listAuditEvents: vi.fn(async (actor: AuditAdminActor) => {
      requireAudit(actor);
      return { data: [safeEvent], meta: { next_cursor: null } };
    }),
    getAuditEvent: vi.fn(async (actor: AuditAdminActor) => {
      requireAudit(actor);
      return { event: safeEvent };
    }),
    createAuditExport: vi.fn(async (actor: AuditAdminActor, body: unknown, key: string) => {
      requireAudit(actor);
      const canonicalBody = JSON.stringify(body);
      const previous = exports.get(key);
      if (previous && previous.body !== canonicalBody)
        throw new ApiPolicyError('idempotency-key-reused', 409, 'idempotency-key-reused');
      if (previous) return previous.promise;
      effects += 1;
      const promise = Promise.resolve({
        export_batch_id: batchId,
        status: 'queued' as const,
        partition_start: '2026-05-01',
        partition_end_exclusive: '2026-08-01',
        accepted_at: '2026-09-01T12:00:00.000Z',
      });
      exports.set(key, { body: canonicalBody, promise });
      return promise;
    }),
  };
  return {
    adminService,
    exportService: {
      exportAuditPartition: vi.fn(async (_actor, input: { export_batch_id: string }) => {
        if (input.export_batch_id.endsWith('99'))
          throw new ApiPolicyError('audit-integrity-failed', 409, 'audit-integrity-failed');
        if (input.export_batch_id.endsWith('98'))
          throw new ApiPolicyError('service-unavailable', 503, 'service-unavailable');
        return {
          export_batch_id: input.export_batch_id,
          status: 'proven' as const,
          object_digest: 'a'.repeat(64),
          retention_proof_class: 'local_synthetic_write_once' as const,
          exported_at: '2026-09-01T12:00:00.000Z',
        };
      }),
    },
    healthService: {
      healthLive: vi.fn(),
      healthReady: vi.fn(),
    },
    resolveAdminActor: async (request) => resolveAdminActor(request),
    resolveServiceActor: async (request) => resolveServiceActor(request),
    rateLimitHmacKey: new Uint8Array(32).fill(8),
    now: () => Date.parse('2026-09-01T12:00:00.000Z'),
    effects: () => effects,
  };
}

function resolveAdminActor(request: FastifyRequest): AuditAdminActor {
  const authorization = request.headers.authorization;
  const principal = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  const aal = request.headers['x-aal'] === '2' ? 2 : request.headers['x-aal'] === '1' ? 1 : null;
  return {
    personId: principal ? '81000000-0000-4000-8000-000000000014' : null,
    principal,
    sessionCurrent: principal !== null,
    aal,
    factorAgeSeconds: aal === 2 ? 300 : null,
    purpose: null,
    requestId: request.id,
    traceId: 'trace-008-route-integration',
  };
}

function resolveServiceActor(request: FastifyRequest): AuditExportServiceActor {
  const authorization = request.headers.authorization;
  if (authorization !== authorizationFor('synthetic-service-credential'))
    return {
      authenticated: false,
      principal: null,
      workerId: null,
      requestId: request.id,
      traceId: 'trace-008-route-service-denied',
    };
  return {
    authenticated: true,
    principal: 'service:audit-export-worker:worker-008-a',
    workerId: 'worker-008-a',
    requestId: request.id,
    traceId: 'trace-008-route-service',
  };
}

function adminHeaders() {
  return {
    authorization: authorizationFor('synthetic-super-admin'),
    'x-aal': '2',
    'x-purpose': 'security.audit.review',
    'accept-language': 'en-EG',
  };
}

function serviceHeaders(key: string) {
  return {
    authorization: authorizationFor('synthetic-service-credential'),
    'idempotency-key': key,
  };
}

function authorizationFor(principal: string): string {
  return ['Bearer', principal].join(' ');
}
