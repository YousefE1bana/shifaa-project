import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { HmacRateLimiter } from '../modules/identity-continuity/index.js';
import type { AuditAdminService } from '../modules/audit-admin/service.js';
import type { AuditExportService } from '../modules/audit-admin/export-service.js';
import type { AuditAdminHealthService } from '../modules/audit-admin/health-service.js';
import type {
  AuditAdminActor,
  AuditEventListQuery,
  AuditExportServiceActor,
  CreateAuditExportInput,
} from '../modules/audit-admin/types.js';
import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';

export const registeredAuditAdminOperationIds = [
  'getAdminSummary',
  'listAuditEvents',
  'getAuditEvent',
  'createAuditExport',
  'exportAuditPartition',
  'healthLive',
  'healthReady',
] as const;

const noStore = {
  'cache-control': 'private, no-store',
  pragma: 'no-cache',
  'referrer-policy': 'no-referrer',
} as const;
const uuid = { type: 'string', format: 'uuid' } as const;
const date = { type: 'string', format: 'date' } as const;
const dateTime = { type: 'string', format: 'date-time' } as const;
const boundedCode = {
  type: 'string',
  minLength: 1,
  maxLength: 96,
  pattern: '^[a-z][a-z0-9._-]*$',
} as const;
const auditQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    actor: uuid,
    action: boundedCode,
    resource_type: { ...boundedCode, maxLength: 64 },
    resource_id: uuid,
    occurred_from: dateTime,
    occurred_before: dateTime,
    outcome: { type: 'string', enum: ['success', 'denied', 'failed'] },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
    cursor: { type: 'string', minLength: 16, maxLength: 512 },
  },
} as const;
const createExportSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['partition_start', 'partition_end_exclusive'],
  properties: { partition_start: date, partition_end_exclusive: date },
} as const;
const internalExportSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['export_batch_id'],
  properties: { export_batch_id: uuid },
} as const;

type AdminService = Pick<
  AuditAdminService,
  'getAdminSummary' | 'listAuditEvents' | 'getAuditEvent' | 'createAuditExport'
>;
type ExportService = Pick<AuditExportService, 'exportAuditPartition'>;
type HealthService = Pick<AuditAdminHealthService, 'healthLive' | 'healthReady'>;

export interface AuditAdminRouteDependencies {
  adminService: AdminService;
  exportService: ExportService;
  healthService: HealthService;
  resolveAdminActor(request: FastifyRequest): Promise<AuditAdminActor>;
  resolveServiceActor(request: FastifyRequest): Promise<AuditExportServiceActor>;
  rateLimitHmacKey: Uint8Array;
  now?: () => number;
}

function responseHeaders(request: FastifyRequest, localized = true) {
  return {
    ...noStore,
    'x-request-id': request.id,
    ...(localized
      ? { 'content-language': request.headers['accept-language'] === 'en-EG' ? 'en-EG' : 'ar-EG' }
      : {}),
  };
}

function idempotencyKey(request: FastifyRequest): string {
  const headerValue = request.headers['idempotency-key'];
  if (typeof headerValue !== 'string' || headerValue.length < 16 || headerValue.length > 128) {
    throw new ApiPolicyError(
      'validation-failed',
      400,
      'A 16 to 128 character Idempotency-Key is required.',
    );
  }
  return headerValue;
}

function requireExactBodyKeys(request: FastifyRequest, expected: readonly string[]): void {
  if (
    !request.body ||
    typeof request.body !== 'object' ||
    Array.isArray(request.body) ||
    Object.keys(request.body).sort().join(',') !== [...expected].sort().join(',')
  )
    throw new ApiPolicyError('validation-failed', 400, 'Request body validation failed.');
}

function adminActor(actor: AuditAdminActor, request: FastifyRequest): AuditAdminActor {
  return {
    ...actor,
    requestId: request.id,
    purpose: typeof request.headers['x-purpose'] === 'string' ? request.headers['x-purpose'] : null,
  };
}

function serviceActor(
  actor: AuditExportServiceActor,
  request: FastifyRequest,
): AuditExportServiceActor {
  return { ...actor, requestId: request.id };
}

function applyRateLimit(
  limiter: HmacRateLimiter,
  reply: FastifyReply,
  operation: string,
  principal: string | null,
  limit: number,
): void {
  const retryAfter = limiter.consume(operation, principal ?? 'unauthenticated', limit, 60_000);
  if (retryAfter === null) return;
  reply.header('retry-after', String(retryAfter));
  throw new ApiPolicyError('rate-limited', 429, 'The request limit was reached.');
}

export async function registerAuditAdminRoutes(
  app: FastifyInstance,
  dependencies: AuditAdminRouteDependencies,
): Promise<void> {
  const limiter = new HmacRateLimiter(dependencies.rateLimitHmacKey, dependencies.now ?? Date.now);

  app.get('/v1/admin/dashboard-summary', async (request, reply) => {
    const actor = adminActor(await dependencies.resolveAdminActor(request), request);
    applyRateLimit(limiter, reply, 'getAdminSummary', actor.principal, 60);
    const response = await dependencies.adminService.getAdminSummary(actor);
    return reply.headers(responseHeaders(request)).send(response);
  });

  app.get(
    '/v1/admin/audit/events',
    { schema: { querystring: auditQuerySchema } },
    async (request, reply) => {
      const actor = adminActor(await dependencies.resolveAdminActor(request), request);
      applyRateLimit(limiter, reply, 'listAuditEvents', actor.principal, 60);
      const query = request.query as Record<string, unknown>;
      const response = await dependencies.adminService.listAuditEvents(actor, {
        ...(typeof query['actor'] === 'string' ? { actor: query['actor'] } : {}),
        ...(typeof query['action'] === 'string' ? { action: query['action'] } : {}),
        ...(typeof query['resource_type'] === 'string'
          ? { resourceType: query['resource_type'] }
          : {}),
        ...(typeof query['resource_id'] === 'string' ? { resourceId: query['resource_id'] } : {}),
        ...(typeof query['occurred_from'] === 'string'
          ? { occurredFrom: query['occurred_from'] }
          : {}),
        ...(typeof query['occurred_before'] === 'string'
          ? { occurredBefore: query['occurred_before'] }
          : {}),
        ...(typeof query['outcome'] === 'string'
          ? { outcome: query['outcome'] as NonNullable<AuditEventListQuery['outcome']> }
          : {}),
        ...(typeof query['limit'] === 'number' ? { limit: query['limit'] } : {}),
        ...(typeof query['cursor'] === 'string' ? { cursor: query['cursor'] } : {}),
      });
      return reply.headers(responseHeaders(request)).send(response);
    },
  );

  app.get(
    '/v1/admin/audit/events/:eventId',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['eventId'],
          properties: { eventId: uuid },
        },
      },
    },
    async (request, reply) => {
      const actor = adminActor(await dependencies.resolveAdminActor(request), request);
      applyRateLimit(limiter, reply, 'getAuditEvent', actor.principal, 60);
      const response = await dependencies.adminService.getAuditEvent(
        actor,
        (request.params as { eventId: string }).eventId,
      );
      return reply.headers(responseHeaders(request)).send(response);
    },
  );

  app.post(
    '/v1/admin/audit/exports',
    {
      schema: { body: createExportSchema },
      preValidation: (request, _reply, done) => {
        requireExactBodyKeys(request, ['partition_start', 'partition_end_exclusive']);
        done();
      },
    },
    async (request, reply) => {
      const actor = adminActor(await dependencies.resolveAdminActor(request), request);
      applyRateLimit(limiter, reply, 'createAuditExport', actor.principal, 20);
      const response = await dependencies.adminService.createAuditExport(
        actor,
        request.body as CreateAuditExportInput,
        idempotencyKey(request),
      );
      return reply.status(202).headers(responseHeaders(request)).send(response);
    },
  );

  app.post(
    '/v1/internal/audit/exports',
    {
      schema: { body: internalExportSchema },
      preValidation: (request, _reply, done) => {
        requireExactBodyKeys(request, ['export_batch_id']);
        done();
      },
    },
    async (request, reply) => {
      const actor = serviceActor(await dependencies.resolveServiceActor(request), request);
      applyRateLimit(limiter, reply, 'exportAuditPartition', actor.principal, 20);
      const response = await dependencies.exportService.exportAuditPartition(
        actor,
        request.body as { export_batch_id: string },
        idempotencyKey(request),
      );
      return reply.headers(responseHeaders(request, false)).send(response);
    },
  );

  app.get('/v1/internal/health/live', async (request, reply) => {
    const actor = serviceActor(await dependencies.resolveServiceActor(request), request);
    applyRateLimit(limiter, reply, 'healthLive', actor.principal, 120);
    const response = dependencies.healthService.healthLive(actor);
    return reply.headers(responseHeaders(request, false)).send(response);
  });

  app.get('/v1/internal/health/ready', async (request, reply) => {
    const actor = serviceActor(await dependencies.resolveServiceActor(request), request);
    applyRateLimit(limiter, reply, 'healthReady', actor.principal, 120);
    const response = await dependencies.healthService.healthReady(actor);
    if (response.status === 'not_ready')
      throw new ApiPolicyError(
        'service-unavailable',
        503,
        'A required internal capability is unavailable.',
      );
    return reply.headers(responseHeaders(request, false)).send(response);
  });
}
