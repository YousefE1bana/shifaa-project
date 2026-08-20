import {
  privacyDsrNotificationOperationIds,
  privacyDsrNotificationRequestSchemas,
  type CreateDsrInput,
  type CreateNotificationTemplateReleaseInput,
  type DownloadDsrExportInput,
  type DsrDecisionInput,
  type DsrFulfilmentInput,
  type PublishNotificationTemplateReleaseInput,
  type ReplayDeadLetterInput,
  type SmsProviderCallbackInput,
} from '@shifaa/contracts/privacy-dsr-notifications';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import type {
  PrivacyActor,
  PrivacyDsrNotificationServicePort,
  PrivacyPageQuery,
} from '../modules/privacy-dsr-notifications/index.js';
import type { IdempotencyStore } from '../platform/idempotency.js';

export const registeredPrivacyDsrNotificationOperationIds = [
  'createDsr',
  'listMyDsrs',
  'getDsr',
  'downloadDsrExport',
  'listAdminDsrs',
  'decideDsr',
  'fulfilDsr',
  'listNotificationTemplates',
  'createNotificationTemplateRelease',
  'publishNotificationTemplateRelease',
  'smsProviderCallback',
  'replayDeadLetter',
] satisfies readonly (typeof privacyDsrNotificationOperationIds)[number][];

const noStore = { 'cache-control': 'private, no-store', pragma: 'no-cache' } as const;
const syntheticModes = new WeakMap<FastifyInstance, boolean>();
const params = (...names: string[]) => ({
  type: 'object',
  required: names,
  properties: Object.fromEntries(names.map((name) => [name, { type: 'string', minLength: 1 }])),
});
const pageQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    managed_patient_id: { type: 'string' },
    type: { type: 'string' },
    status: { type: 'string' },
    due_before: { type: 'string' },
    code: { type: 'string' },
    locale: { type: 'string' },
    channel: { type: 'string' },
    cursor: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
  },
} as const;

function actorFor(request: FastifyRequest): PrivacyActor {
  if (!syntheticModes.get(request.server))
    throw new ApiPolicyError('open-sec-001', 503, 'Privacy sessions are seeded-synthetic only.');
  const token = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice(7)
    : '';
  const patterns = [
    ['patient', /^synthetic-person:([0-9a-f-]{36})$/],
    ['dpo', /^synthetic-dpo:([0-9a-f-]{36})$/],
    ['support_admin', /^synthetic-admin:support_admin:([0-9a-f-]{36})$/],
    ['platform_operator', /^synthetic-admin:platform_operator:([0-9a-f-]{36})$/],
  ] as const;
  const matched = patterns
    .map(([role, pattern]) => [role, pattern.exec(token)] as const)
    .find(([, match]) => match);
  if (!matched?.[1])
    throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
  const patientContext = request.headers['x-shifaa-patient-context'];
  return {
    personId: matched[1][1]!,
    principal: token,
    requestId: request.id,
    role: matched[0],
    aal: request.headers['x-aal'] === '2' ? 2 : 1,
    ...(typeof request.headers['x-purpose'] === 'string'
      ? { purpose: request.headers['x-purpose'] }
      : {}),
    ...(typeof patientContext === 'string' ? { selectedPatientId: patientContext } : {}),
  };
}
function key(request: FastifyRequest) {
  const value = request.headers['idempotency-key'];
  if (typeof value !== 'string')
    throw new ApiPolicyError('idempotency-key-required', 400, 'Idempotency-Key is required.');
  return value;
}
function version(request: FastifyRequest) {
  const value = request.headers['if-match'];
  if (typeof value !== 'string' || !/^"[1-9][0-9]*"$/.test(value))
    throw new ApiPolicyError('if-match-required', 428, 'If-Match is required.');
  return Number(value.slice(1, -1));
}
async function mutate(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: PrivacyRouteDependencies,
  status: number,
  work: (actor: PrivacyActor) => unknown,
) {
  const actor = actorFor(request);
  const stored = await deps.idempotency.execute({
    principal: actor.principal,
    method: request.method,
    route: request.routeOptions.url ?? request.url,
    key: key(request),
    body: request.body,
    work: async () => ({ status, headers: noStore, body: await work(actor) }),
  });
  return reply.status(stored.status).headers(stored.headers).send(stored.body);
}

export interface PrivacyRouteDependencies {
  service: PrivacyDsrNotificationServicePort;
  idempotency: IdempotencyStore;
  syntheticMode: boolean;
}

export async function registerPrivacyDsrNotificationRoutes(
  app: FastifyInstance,
  deps: PrivacyRouteDependencies,
) {
  syntheticModes.set(app, deps.syntheticMode);
  app.get('/v1/privacy/requests', { schema: { querystring: pageQuery } }, async (request, reply) =>
    reply
      .headers(noStore)
      .send(await deps.service.listMyDsrs(actorFor(request), request.query as PrivacyPageQuery)),
  );
  app.post(
    '/v1/privacy/requests',
    { schema: { body: privacyDsrNotificationRequestSchemas.createDsr } },
    (request, reply) =>
      mutate(request, reply, deps, 201, (actor) =>
        deps.service.createDsr(actor, request.body as CreateDsrInput),
      ),
  );
  app.get(
    '/v1/privacy/requests/:requestId',
    { schema: { params: params('requestId') } },
    async (request, reply) =>
      reply
        .headers(noStore)
        .send(
          await deps.service.getDsr(
            actorFor(request),
            (request.params as { requestId: string }).requestId,
          ),
        ),
  );
  app.post(
    '/v1/privacy/requests/:requestId/download-link',
    { schema: { params: params('requestId') } },
    async (request, reply) => {
      const body = request.body as DownloadDsrExportInput | undefined;
      if (
        body !== undefined &&
        (typeof body !== 'object' ||
          typeof body.capability_token !== 'string' ||
          body.capability_token.length < 32 ||
          body.capability_token.length > 512 ||
          Object.keys(body).some((name) => name !== 'capability_token'))
      )
        throw new ApiPolicyError('validation-failed', 422, 'Invalid export capability body.');
      const actor = actorFor(request);
      const stored = await deps.idempotency.execute({
        principal: actor.principal,
        method: request.method,
        route: request.routeOptions.url ?? request.url,
        key: key(request),
        body: request.body,
        work: async () => ({
          status: 200,
          headers: noStore,
          body: await deps.service.downloadDsrExport(
            actor,
            (request.params as { requestId: string }).requestId,
            body?.capability_token,
          ),
        }),
      });
      const result = stored.body;
      if (result instanceof Uint8Array)
        return reply.type('application/octet-stream').headers(noStore).send(Buffer.from(result));
      return reply.status(stored.status).headers(stored.headers).send(result);
    },
  );
  app.get(
    '/v1/admin/privacy/requests',
    { schema: { querystring: pageQuery } },
    async (request, reply) =>
      reply
        .headers(noStore)
        .send(
          await deps.service.listAdminDsrs(actorFor(request), request.query as PrivacyPageQuery),
        ),
  );
  app.post(
    '/v1/admin/privacy/requests/:requestId/decision',
    {
      schema: { params: params('requestId'), body: privacyDsrNotificationRequestSchemas.decideDsr },
    },
    (request, reply) =>
      mutate(request, reply, deps, 200, (actor) =>
        deps.service.decideDsr(
          actor,
          (request.params as { requestId: string }).requestId,
          request.body as DsrDecisionInput,
          version(request),
        ),
      ),
  );
  app.post(
    '/v1/admin/privacy/requests/:requestId/fulfilment',
    {
      schema: { params: params('requestId'), body: privacyDsrNotificationRequestSchemas.fulfilDsr },
    },
    (request, reply) =>
      mutate(request, reply, deps, 200, (actor) =>
        deps.service.fulfilDsr(
          actor,
          (request.params as { requestId: string }).requestId,
          request.body as DsrFulfilmentInput,
          version(request),
        ),
      ),
  );
  app.get(
    '/v1/admin/notification-templates',
    { schema: { querystring: pageQuery } },
    async (request, reply) =>
      reply
        .headers(noStore)
        .send(
          await deps.service.listNotificationTemplates(
            actorFor(request),
            request.query as PrivacyPageQuery,
          ),
        ),
  );
  app.post(
    '/v1/admin/notification-templates/:templateCode/releases',
    {
      schema: {
        params: params('templateCode'),
        body: privacyDsrNotificationRequestSchemas.createNotificationTemplateRelease,
      },
    },
    (request, reply) =>
      mutate(request, reply, deps, 201, (actor) =>
        deps.service.createNotificationTemplateRelease(
          actor,
          (request.params as { templateCode: string }).templateCode,
          request.body as CreateNotificationTemplateReleaseInput,
        ),
      ),
  );
  app.post(
    '/v1/admin/notification-templates/releases/:releaseId/publish',
    {
      schema: {
        params: params('releaseId'),
        body: privacyDsrNotificationRequestSchemas.publishNotificationTemplateRelease,
      },
    },
    (request, reply) =>
      mutate(request, reply, deps, 200, (actor) =>
        deps.service.publishNotificationTemplateRelease(
          actor,
          (request.params as { releaseId: string }).releaseId,
          request.body as PublishNotificationTemplateReleaseInput,
          version(request),
        ),
      ),
  );
  app.post(
    '/v1/internal/callbacks/messages/:provider',
    {
      schema: {
        params: params('provider'),
        body: privacyDsrNotificationRequestSchemas.smsProviderCallback,
      },
    },
    async (request, reply) => {
      if ((request.params as { provider: string }).provider !== 'local-synthetic')
        throw new ApiPolicyError('provider-unsupported', 404, 'Provider unsupported.');
      const signature = request.headers['x-provider-signature'];
      const timestamp = request.headers['x-provider-timestamp'];
      if (typeof signature !== 'string' || typeof timestamp !== 'string')
        throw new ApiPolicyError(
          'provider-signature-required',
          401,
          'Signed provider envelope required.',
        );
      return reply
        .headers(noStore)
        .send(
          await deps.service.smsProviderCallback(
            request.body as SmsProviderCallbackInput,
            signature,
            timestamp,
          ),
        );
    },
  );
  app.post(
    '/v1/internal/outbox/dead-letters/:eventId/replay',
    {
      schema: {
        params: params('eventId'),
        body: privacyDsrNotificationRequestSchemas.replayDeadLetter,
      },
    },
    (request, reply) =>
      mutate(request, reply, deps, 202, (actor) =>
        deps.service.replayDeadLetter(
          actor,
          (request.params as { eventId: string }).eventId,
          request.body as ReplayDeadLetterInput,
          version(request),
        ),
      ),
  );
}
