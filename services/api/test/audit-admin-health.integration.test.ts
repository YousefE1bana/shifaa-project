import { randomUUID } from 'node:crypto';

import Fastify, { type FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditAdminHealthService } from '../src/modules/audit-admin/health-service.js';
import type {
  AuditExportServiceActor,
  ReadinessSnapshot,
} from '../src/modules/audit-admin/types.js';
import { ApiPolicyError } from '../src/modules/identity-onboarding/errors.js';
import { registerAuditAdminRoutes } from '../src/routes/audit-admin.js';
import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';

const serviceCredential = 'synthetic-private-platform-probe-credential';
const observedAt = '2026-09-01T12:00:00.000Z';
const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe('Feature 008 private liveness and readiness routes', () => {
  it('accepts only the exact private-network platform probe', async () => {
    const harness = await buildHealthApp();
    for (const request of [
      { authorization: undefined, remoteAddress: '10.10.0.8', status: 401 },
      { authorization: 'Bearer wrong', remoteAddress: '10.10.0.8', status: 401 },
      {
        authorization: `Bearer ${serviceCredential}`,
        remoteAddress: '203.0.113.8',
        status: 403,
      },
    ]) {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/v1/internal/health/ready',
        remoteAddress: request.remoteAddress,
        headers: request.authorization ? { authorization: request.authorization } : {},
      });
      expect(response.statusCode).toBe(request.status);
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    expect(harness.readiness).not.toHaveBeenCalled();
  });

  it('keeps liveness healthy while dependencies are unavailable', async () => {
    const harness = await buildHealthApp({
      readiness: snapshot('unavailable', 'integrity_failed'),
      auditIntegrity: 'failed',
      exportProof: 'failed',
    });
    const response = await injectProbe(harness.app, '/v1/internal/health/live');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'live', observed_at: observedAt });
    expect(harness.readiness).not.toHaveBeenCalled();
    expect(harness.auditIntegrity).not.toHaveBeenCalled();
    expect(harness.exportProof).not.toHaveBeenCalled();
  });

  it.each([
    [{}, 200, 'ready', []],
    [{ readiness: snapshot('ready', 'backlogged') }, 200, 'degraded', ['outbox_backlog']],
    [{ readiness: snapshot('unavailable', 'ready') }, 503, 'not_ready', ['database_unavailable']],
    [
      { readiness: snapshot('ready', 'integrity_failed') },
      503,
      'not_ready',
      ['outbox_integrity_failed'],
    ],
    [{ auditIntegrity: 'failed' }, 503, 'not_ready', ['audit_integrity_failed']],
    [{ exportProof: 'failed' }, 503, 'not_ready', ['export_proof_failed']],
  ] as const)('returns bounded readiness case %#', async (scenario, status, state, reasons) => {
    const harness = await buildHealthApp(scenario);
    const response = await injectProbe(harness.app, '/v1/internal/health/ready');
    expect(response.statusCode).toBe(status);
    if (state === 'not_ready') {
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ code: 'service-unavailable', errors: [] });
      expect(response.body).not.toMatch(new RegExp(reasons.join('|')));
    } else {
      expect(response.json()).toEqual({ status: state, reasons, observed_at: observedAt });
    }
    expect(harness.telemetry.at(-1)).toMatchObject({
      outcome: state,
      ...(reasons[0] === undefined ? {} : { reason: reasons[0] }),
    });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('fails closed on bounded timeout without secret, topology, SQL, or payload detail', async () => {
    const harness = await buildHealthApp({ timeout: true });
    const response = await injectProbe(harness.app, '/v1/internal/health/ready');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'service-unavailable', errors: [] });
    expect(harness.telemetry.at(-1)).toMatchObject({
      outcome: 'not_ready',
      reason: 'database_unavailable',
    });
    const combined = JSON.stringify({ response: response.json(), telemetry: harness.telemetry });
    expect(combined).not.toMatch(
      /credential|password|secret|postgres|select |10\.10|outbox payload|clinical|patient|facility/i,
    );
  });

  it('rate-limits probe abuse before invoking liveness again', async () => {
    const harness = await buildHealthApp();
    for (let index = 0; index < 120; index += 1)
      expect((await injectProbe(harness.app, '/v1/internal/health/live')).statusCode).toBe(200);
    const limited = await injectProbe(harness.app, '/v1/internal/health/live');
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(harness.telemetry).toHaveLength(120);
  });
});

type HealthScenario = {
  readiness?: ReadinessSnapshot;
  auditIntegrity?: 'ready' | 'failed';
  exportProof?: 'ready' | 'failed';
  timeout?: boolean;
};

async function buildHealthApp(scenario: HealthScenario = {}) {
  const app = Fastify({ genReqId: () => randomUUID() });
  apps.push(app);
  installIdentityErrorHandler(app);
  const never = () => new Promise<never>(() => undefined);
  const readiness = vi.fn(async () => scenario.readiness ?? snapshot('ready', 'ready'));
  const auditIntegrity = vi.fn(async () => scenario.auditIntegrity ?? 'ready');
  const exportProof = vi.fn(async () => scenario.exportProof ?? 'ready');
  const telemetry: unknown[] = [];
  const healthService = new AuditAdminHealthService({
    readiness: {
      readiness: scenario.timeout ? never : readiness,
      healthExposureEnabled: async () => true,
    },
    integrity: {
      auditIntegrity: scenario.timeout ? never : auditIntegrity,
      exportProof: scenario.timeout ? never : exportProof,
    },
    clock: { now: () => new Date(observedAt) },
    telemetry: { emit: (event) => telemetry.push(event) },
    timeoutMs: scenario.timeout ? 5 : 500,
  });
  await registerAuditAdminRoutes(app, {
    adminService: {
      getAdminSummary: vi.fn(),
      listAuditEvents: vi.fn(),
      getAuditEvent: vi.fn(),
      createAuditExport: vi.fn(),
    },
    exportService: { exportAuditPartition: vi.fn() },
    healthService,
    resolveAdminActor: vi.fn(),
    resolveServiceActor,
    rateLimitHmacKey: new Uint8Array(32).fill(8),
    now: () => Date.parse(observedAt),
  });
  return { app, readiness, auditIntegrity, exportProof, telemetry };
}

async function resolveServiceActor(request: FastifyRequest): Promise<AuditExportServiceActor> {
  if (!isPrivateAddress(request.ip)) throw new ApiPolicyError('forbidden', 403, 'forbidden');
  if (request.headers.authorization !== `Bearer ${serviceCredential}`)
    throw new ApiPolicyError('authentication-required', 401, 'authentication-required');
  return {
    authenticated: true,
    principal: 'service:platform-probe',
    workerId: null,
    requestId: request.id,
    traceId: 'f'.repeat(32),
  };
}

function isPrivateAddress(address: string): boolean {
  return /^(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address);
}

function injectProbe(app: ReturnType<typeof Fastify>, url: string) {
  return app.inject({
    method: 'GET',
    url,
    remoteAddress: '10.10.0.8',
    headers: { authorization: `Bearer ${serviceCredential}` },
  });
}

function snapshot(
  database: ReadinessSnapshot['database'],
  outbox: ReadinessSnapshot['outbox'],
): ReadinessSnapshot {
  return {
    status:
      database === 'ready' && outbox === 'ready'
        ? 'ready'
        : database === 'ready' && outbox === 'backlogged'
          ? 'degraded'
          : 'not_ready',
    database,
    outbox,
  };
}
