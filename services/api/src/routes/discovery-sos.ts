import { createHash } from 'node:crypto';

import {
  discoverySosOperationIds,
  discoverySosRequestSchemas,
  type AcceptSosPrearrivalInput,
  type CloseSosIncidentInput,
  type CreateEmergencyShareInput,
  type CreateSosIncidentInput,
  type DiscoverySearchQuery,
  type SosPrearrivalQuery,
} from '@shifaa/contracts/discovery-sos';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { DiscoverySosActor, DiscoverySosServicePort } from '../modules/discovery-sos/index.js';
import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import type { IdempotencyStore } from '../platform/idempotency.js';

export const registeredDiscoverySosOperationIds = [
  'searchFacilities',
  'getFacilityCapacity',
  'createSosIncident',
  'getSosIncident',
  'listSosPrearrivals',
  'acceptSosPrearrival',
  'closeSosIncident',
  'createEmergencyShare',
  'revokeEmergencyShare',
  'viewEmergencyShare',
] satisfies readonly (typeof discoverySosOperationIds)[number][];

export const redactDiscoverySosRequestPath = (path: string) =>
  path.replace(/(\/sos\/share\/)[A-Za-z0-9_-]+/, '$1[REDACTED]');

const noStore = { 'cache-control': 'private, no-store', pragma: 'no-cache' } as const;
const shareHeaders = { ...noStore, 'referrer-policy': 'no-referrer' } as const;
const syntheticModes = new WeakMap<FastifyInstance, boolean>();
const rateLimitWindows = new WeakMap<
  FastifyInstance,
  Map<string, { count: number; resetAt: number }>
>();
export const discoverySosRateLimits = Object.freeze({
  discoveryReadPerMinute: 120,
  sosCreatePerFiveMinutes: 10,
  protectedMutationPerFiveMinutes: 30,
  shareViewPerMinute: 30,
  maximumBucketsPerServer: 4096,
});
const pathParams = (...names: string[]) => ({
  type: 'object',
  additionalProperties: false,
  required: names,
  properties: Object.fromEntries(names.map((name) => [name, { type: 'string', format: 'uuid' }])),
});
const tokenParams = {
  type: 'object',
  additionalProperties: false,
  required: ['token'],
  properties: {
    token: { type: 'string', minLength: 43, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' },
  },
} as const;

interface DiscoverySosRouteDependencies {
  service: DiscoverySosServicePort;
  idempotency: IdempotencyStore;
  syntheticMode: boolean;
}

function enforceRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  operation: 'discovery-read' | 'protected-mutation' | 'sos-create' | 'share-view',
  limit: number,
  windowMs: number,
  subject: string,
) {
  let windows = rateLimitWindows.get(request.server);
  if (!windows) {
    windows = new Map();
    rateLimitWindows.set(request.server, windows);
  }
  const key = `${operation}:${subject}`;
  const now = Date.now();
  for (const [candidate, value] of windows) {
    if (value.resetAt <= now) windows.delete(candidate);
  }
  const current = windows.get(key);
  if (!current && windows.size >= discoverySosRateLimits.maximumBucketsPerServer) {
    const oldest = windows.keys().next().value as string | undefined;
    if (oldest) windows.delete(oldest);
  }
  const bucket =
    !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  bucket.count += 1;
  windows.set(key, bucket);
  if (bucket.count <= limit) return;
  reply.header('retry-after', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
  throw new ApiPolicyError(
    'rate-limited',
    429,
    'Request limit reached. Emergency phone guidance remains available.',
  );
}

const networkRateSubject = (request: FastifyRequest) =>
  createHash('sha256').update(`network:${request.ip}`).digest('hex');

const actorRateSubject = (actor: DiscoverySosActor) =>
  createHash('sha256').update(`actor:${actor.personId}`).digest('hex');

function actorFor(request: FastifyRequest): DiscoverySosActor {
  if (!syntheticModes.get(request.server)) {
    throw new ApiPolicyError(
      'open-legal-001',
      503,
      'Discovery and SOS sessions remain disabled outside seeded-synthetic mode.',
    );
  }
  const token = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice(7)
    : '';
  const person = /^synthetic-person:([0-9a-f-]{36})$/.exec(token);
  if (!person) throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
  const selectedPatientId =
    typeof request.headers['x-shifaa-patient-context'] === 'string'
      ? request.headers['x-shifaa-patient-context']
      : undefined;
  return {
    personId: person[1]!,
    principal: token,
    requestId: request.id,
    aal: request.headers['x-aal'] === '2' ? 2 : 1,
    locale: request.headers['accept-language'] === 'en-EG' ? 'en-EG' : 'ar-EG',
    ...(selectedPatientId ? { selectedPatientId } : {}),
    ...(typeof request.headers['x-purpose'] === 'string'
      ? { purpose: request.headers['x-purpose'] }
      : {}),
  };
}

function idempotencyKey(request: FastifyRequest): string {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string') {
    throw new ApiPolicyError('idempotency-key-required', 400, 'Idempotency-Key is required.');
  }
  return key;
}

function resourceVersion(request: FastifyRequest): number {
  const value = request.headers['if-match'];
  if (typeof value !== 'string' || !/^"[1-9][0-9]*"$/.test(value)) {
    throw new ApiPolicyError('if-match-required', 428, 'If-Match is required.');
  }
  return Number(value.slice(1, -1));
}

function responseHeaders(request: FastifyRequest, sensitive = false) {
  const language = request.headers['accept-language'] === 'en-EG' ? 'en-EG' : 'ar-EG';
  return {
    'x-request-id': request.id,
    'content-language': language,
    ...(sensitive ? noStore : {}),
  };
}

async function mutate(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: DiscoverySosRouteDependencies,
  status: 200 | 201,
  work: (actor: DiscoverySosActor) => Promise<unknown>,
  headers: Readonly<Record<string, string>> = noStore,
) {
  const actor = actorFor(request);
  const subject = actorRateSubject(actor);
  const networkSubject = networkRateSubject(request);
  enforceRateLimit(
    request,
    reply,
    'protected-mutation',
    discoverySosRateLimits.protectedMutationPerFiveMinutes,
    5 * 60_000,
    networkSubject,
  );
  enforceRateLimit(
    request,
    reply,
    'protected-mutation',
    discoverySosRateLimits.protectedMutationPerFiveMinutes,
    5 * 60_000,
    subject,
  );
  if (request.routeOptions.url === '/v1/sos/incidents') {
    enforceRateLimit(
      request,
      reply,
      'sos-create',
      discoverySosRateLimits.sosCreatePerFiveMinutes,
      5 * 60_000,
      networkSubject,
    );
    enforceRateLimit(
      request,
      reply,
      'sos-create',
      discoverySosRateLimits.sosCreatePerFiveMinutes,
      5 * 60_000,
      subject,
    );
  }
  const stored = await dependencies.idempotency.execute({
    principal: actor.principal,
    method: request.method,
    route: request.routeOptions.url ?? redactDiscoverySosRequestPath(request.url),
    key: idempotencyKey(request),
    body: {
      params: request.params,
      body: request.body,
      if_match: request.headers['if-match'] ?? null,
    },
    work: async () => ({
      status,
      headers: { ...responseHeaders(request, true), ...headers },
      body: await work(actor),
    }),
  });
  return reply.status(stored.status).headers(stored.headers).send(stored.body);
}

export async function registerDiscoverySosRoutes(
  app: FastifyInstance,
  dependencies: DiscoverySosRouteDependencies,
): Promise<void> {
  syntheticModes.set(app, dependencies.syntheticMode);

  app.get(
    '/v1/discovery/facilities',
    { schema: { querystring: discoverySosRequestSchemas.searchFacilities } },
    async (request, reply) => {
      enforceRateLimit(
        request,
        reply,
        'discovery-read',
        discoverySosRateLimits.discoveryReadPerMinute,
        60_000,
        networkRateSubject(request),
      );
      return reply
        .headers(responseHeaders(request, true))
        .send(
          await dependencies.service.searchFacilities(
            request.query as DiscoverySearchQuery,
            request.headers['accept-language'] === 'en-EG' ? 'en-EG' : 'ar-EG',
          ),
        );
    },
  );
  app.get(
    '/v1/discovery/hospitals/:facilityId/capacity',
    { schema: { params: pathParams('facilityId') } },
    async (request, reply) => {
      enforceRateLimit(
        request,
        reply,
        'discovery-read',
        discoverySosRateLimits.discoveryReadPerMinute,
        60_000,
        networkRateSubject(request),
      );
      return reply
        .headers(responseHeaders(request, true))
        .send(
          await dependencies.service.getFacilityCapacity(
            (request.params as { facilityId: string }).facilityId,
          ),
        );
    },
  );
  app.post(
    '/v1/sos/incidents',
    { schema: { body: discoverySosRequestSchemas.createSosIncident } },
    (request, reply) => {
      return mutate(request, reply, dependencies, 201, (actor) =>
        dependencies.service.createSosIncident(actor, request.body as CreateSosIncidentInput),
      );
    },
  );
  app.get(
    '/v1/sos/incidents/:incidentId',
    { schema: { params: pathParams('incidentId') } },
    async (request, reply) =>
      reply
        .headers(responseHeaders(request, true))
        .send(
          await dependencies.service.getSosIncident(
            actorFor(request),
            (request.params as { incidentId: string }).incidentId,
          ),
        ),
  );
  app.get(
    '/v1/hospitals/:facilityId/sos-prearrivals',
    {
      schema: {
        params: pathParams('facilityId'),
        querystring: discoverySosRequestSchemas.listSosPrearrivals,
      },
    },
    async (request, reply) =>
      reply
        .headers(responseHeaders(request, true))
        .send(
          await dependencies.service.listSosPrearrivals(
            actorFor(request),
            (request.params as { facilityId: string }).facilityId,
            request.query as SosPrearrivalQuery,
          ),
        ),
  );
  app.post(
    '/v1/hospitals/:facilityId/sos-incidents/:incidentId/accept',
    {
      schema: {
        params: pathParams('facilityId', 'incidentId'),
        body: discoverySosRequestSchemas.acceptSosPrearrival,
      },
    },
    (request, reply) => {
      const params = request.params as { facilityId: string; incidentId: string };
      return mutate(request, reply, dependencies, 200, (actor) =>
        dependencies.service.acceptSosPrearrival(
          actor,
          params.facilityId,
          params.incidentId,
          request.body as AcceptSosPrearrivalInput,
          resourceVersion(request),
        ),
      );
    },
  );
  app.post(
    '/v1/sos/incidents/:incidentId/close',
    {
      schema: {
        params: pathParams('incidentId'),
        body: discoverySosRequestSchemas.closeSosIncident,
      },
    },
    (request, reply) =>
      mutate(request, reply, dependencies, 200, (actor) =>
        dependencies.service.closeSosIncident(
          actor,
          (request.params as { incidentId: string }).incidentId,
          request.body as CloseSosIncidentInput,
          resourceVersion(request),
        ),
      ),
  );
  app.post(
    '/v1/sos/incidents/:incidentId/share-links',
    {
      schema: {
        params: pathParams('incidentId'),
        body: discoverySosRequestSchemas.createEmergencyShare,
      },
    },
    (request, reply) =>
      mutate(
        request,
        reply,
        dependencies,
        201,
        (actor) =>
          dependencies.service.createEmergencyShare(
            actor,
            (request.params as { incidentId: string }).incidentId,
            request.body as CreateEmergencyShareInput,
          ),
        shareHeaders,
      ),
  );
  app.post(
    '/v1/sos/share-links/:shareId/revoke',
    { schema: { params: pathParams('shareId') } },
    (request, reply) =>
      mutate(request, reply, dependencies, 200, (actor) =>
        dependencies.service.revokeEmergencyShare(
          actor,
          (request.params as { shareId: string }).shareId,
          resourceVersion(request),
        ),
      ),
  );
  app.get('/v1/sos/share/:token', { schema: { params: tokenParams } }, async (request, reply) => {
    enforceRateLimit(
      request,
      reply,
      'share-view',
      discoverySosRateLimits.shareViewPerMinute,
      60_000,
      networkRateSubject(request),
    );
    return reply
      .headers({ ...responseHeaders(request, true), ...shareHeaders })
      .send(
        await dependencies.service.viewEmergencyShare(
          (request.params as { token: string }).token,
          request.id,
        ),
      );
  });
}
