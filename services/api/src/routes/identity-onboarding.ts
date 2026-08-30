import { createHmac, randomUUID } from 'node:crypto';

import {
  requestSchemas,
  routeCatalog,
  type ConsentInput,
  type IdentityInput,
  type LoginInput,
  type OtpVerificationInput,
  type ProfilePatchInput,
  type ProviderCallbackInput,
  type RegisterPersonInput,
  type ReviewDecisionInput,
  type UploadMetadata,
} from '@shifaa/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { ApiConfig } from '../config.js';
import {
  ApiPolicyError,
  type IdentityOnboardingService,
  type RequestActor,
} from '../modules/identity-onboarding/index.js';
import { preauthPrincipal, type IdempotencyStore } from '../platform/idempotency.js';
import { initialBrowserSessionCookies } from './auth-session-cookies.js';

export const registeredIdentityOnboardingOperationIds = routeCatalog.map(
  ({ operationId }) => operationId,
);

export interface IdentityRouteDependencies {
  config: ApiConfig;
  service: IdentityOnboardingService;
  idempotency: IdempotencyStore;
}

const noStoreHeaders = {
  'cache-control': 'private, no-store',
  pragma: 'no-cache',
};

function problemTitle(code: string, locale: string): string {
  const arabic = locale.toLowerCase().startsWith('ar');
  if (arabic) {
    if (code === 'permission-denied') return 'غير مسموح بهذا الإجراء';
    if (code === 'validation-failed') return 'راجع البيانات المدخلة';
    if (code === 'version-conflict') return 'تم تحديث البيانات';
    return 'تعذر إكمال الطلب';
  }
  if (code === 'permission-denied') return 'This action is not allowed';
  if (code === 'validation-failed') return 'Check the information you entered';
  if (code === 'version-conflict') return 'The information changed';
  return 'The request could not be completed';
}

function parseIfMatch(request: FastifyRequest): number {
  const value = request.headers['if-match'];
  if (typeof value !== 'string' || !/^"[1-9][0-9]*"$/.test(value)) {
    throw new ApiPolicyError('if-match-required', 428, 'Refresh this item before saving changes.');
  }
  return Number(value.slice(1, -1));
}

function idempotencyKey(request: FastifyRequest): string {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string') {
    throw new ApiPolicyError('idempotency-key-required', 400, 'Idempotency-Key is required.');
  }
  return key;
}

async function actorFor(
  request: FastifyRequest,
  service: IdentityOnboardingService,
): Promise<RequestActor> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
  }
  const token = authorization.slice('Bearer '.length);
  if (token.startsWith('synthetic-reviewer:')) {
    return {
      kind: 'ADM-FACILITY',
      personId: '00000000-0000-4000-8000-000000000002',
      principal: token,
      aal: request.headers['x-aal'] === '2' ? 2 : 1,
      purposes:
        typeof request.headers['x-purpose'] === 'string'
          ? request.headers['x-purpose'].split(',').map((value) => value.trim())
          : [],
    };
  }
  const patient = await service.actorFromAccessToken(token);
  if (!patient) throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
  return patient;
}

async function executeMutation<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: IdentityRouteDependencies,
  principal: string,
  status: number,
  work: () => Promise<T>,
) {
  const result = await deps.idempotency.execute({
    principal,
    method: request.method,
    route: request.routeOptions.url ?? request.url,
    key: idempotencyKey(request),
    body: request.body,
    work: async () => ({ status, headers: noStoreHeaders, body: await work() }),
  });
  return reply.status(result.status).headers(result.headers).send(result.body);
}

async function executePreparedMutation<T, P>(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: IdentityRouteDependencies,
  principal: string,
  status: number,
  prepare: () => Promise<P>,
  work: (prepared: P) => Promise<T>,
) {
  const result = await deps.idempotency.execute({
    principal,
    method: request.method,
    route: request.routeOptions.url ?? request.url,
    key: idempotencyKey(request),
    body: request.body,
    prepare,
    work: async (prepared) => ({ status, headers: noStoreHeaders, body: await work(prepared) }),
  });
  return reply.status(result.status).headers(result.headers).send(result.body);
}

export async function registerIdentityOnboardingRoutes(
  app: FastifyInstance,
  deps: IdentityRouteDependencies,
): Promise<void> {
  app.addHook('onRequest', async (_request, reply) => {
    void reply.headers(noStoreHeaders);
  });

  app.post(
    '/v1/auth/register',
    { schema: { body: requestSchemas.registerPerson } },
    async (request, reply) => {
      const body = request.body as RegisterPersonInput;
      return executePreparedMutation(
        request,
        reply,
        deps,
        preauthPrincipal(body.handle, deps.config.preauthHmacKey),
        201,
        () => deps.service.prepareRegistration(body),
        (challenge) =>
          deps.service.completeRegistration(
            { handle: body.handle, locale: body.locale, requestId: request.id },
            challenge,
          ),
      );
    },
  );

  app.post('/v1/auth/login', { schema: { body: requestSchemas.login } }, async (request, reply) => {
    const body = request.body as LoginInput;
    return executePreparedMutation(
      request,
      reply,
      deps,
      preauthPrincipal(body.handle, deps.config.preauthHmacKey),
      200,
      () => deps.service.login(body),
      async (result) => result,
    );
  });

  app.post(
    '/v1/auth/otp/verify',
    { schema: { body: requestSchemas.verifyOtp } },
    async (request, reply) => {
      const body = request.body as OtpVerificationInput;
      const result = await deps.idempotency.execute({
        principal: body.challenge_id,
        method: request.method,
        route: request.routeOptions.url ?? request.url,
        key: idempotencyKey(request),
        body: request.body,
        prepare: () => deps.service.prepareOtpVerification(body.challenge_id, body.code),
        work: async (session) => {
          const browser =
            typeof request.headers.origin === 'string' &&
            request.headers['sec-fetch-site'] === 'same-origin';
          return {
            status: 200,
            headers: {
              ...noStoreHeaders,
              ...(browser && session.refreshToken
                ? { 'set-cookie': initialBrowserSessionCookies(session.refreshToken) }
                : {}),
            },
            body: await deps.service.completeOtpVerification(session, request.id),
          };
        },
      });
      return reply.status(result.status).headers(result.headers).send(result.body);
    },
  );

  app.get('/v1/people/me', async (request) =>
    deps.service.getProfile(await actorFor(request, deps.service)),
  );

  app.patch(
    '/v1/people/me',
    { schema: { body: requestSchemas.updateMyProfile } },
    async (request, reply) => {
      const actor = await actorFor(request, deps.service);
      return executeMutation(request, reply, deps, actor.principal, 200, () =>
        deps.service.updateProfile(
          actor,
          parseIfMatch(request),
          request.body as ProfilePatchInput,
          request.id,
        ),
      );
    },
  );

  app.get('/v1/people/me/identities', async (request) =>
    deps.service.listIdentities(await actorFor(request, deps.service)),
  );

  app.post(
    '/v1/people/me/identities',
    { schema: { body: requestSchemas.createIdentityProof } },
    async (request, reply) => {
      const actor = await actorFor(request, deps.service);
      return executeMutation(request, reply, deps, actor.principal, 201, () =>
        deps.service.createIdentity(actor, request.body as IdentityInput, request.id),
      );
    },
  );

  app.post(
    '/v1/identity-verifications/:caseId/upload-intent',
    {
      schema: {
        params: {
          type: 'object',
          required: ['caseId'],
          properties: { caseId: { type: 'string', format: 'uuid' } },
        },
        body: requestSchemas.createIdentityUpload,
      },
    },
    async (request, reply) => {
      const actor = await actorFor(request, deps.service);
      const { caseId } = request.params as { caseId: string };
      return executePreparedMutation(
        request,
        reply,
        deps,
        actor.principal,
        201,
        () => deps.service.prepareUpload(actor, caseId, request.body as UploadMetadata),
        (intent) => deps.service.completeUpload(intent),
      );
    },
  );

  app.get('/v1/identity-verifications/:caseId', async (request) => {
    const actor = await actorFor(request, deps.service);
    return deps.service.getVerificationCase(actor, (request.params as { caseId: string }).caseId);
  });

  app.get('/v1/admin/identity-verifications', async (request) =>
    deps.service.listReviewCases(await actorFor(request, deps.service)),
  );

  app.post(
    '/v1/admin/identity-verifications/:caseId/decision',
    { schema: { body: requestSchemas.reviewVerificationCase } },
    async (request, reply) => {
      const actor = await actorFor(request, deps.service);
      const { caseId } = request.params as { caseId: string };
      return executeMutation(request, reply, deps, actor.principal, 200, () =>
        deps.service.reviewCase(
          actor,
          caseId,
          parseIfMatch(request),
          request.body as ReviewDecisionInput,
          request.id,
        ),
      );
    },
  );

  app.get('/v1/privacy/notices/current', async (request) => {
    const locale = request.headers['accept-language']?.toLowerCase().startsWith('en')
      ? 'en-EG'
      : 'ar-EG';
    return deps.service.currentNotice(locale);
  });

  app.get('/v1/privacy/consents', async (request) =>
    deps.service.listConsents(await actorFor(request, deps.service)),
  );

  app.post(
    '/v1/privacy/consents',
    { schema: { body: requestSchemas.recordConsent } },
    async (request, reply) => {
      const actor = await actorFor(request, deps.service);
      return executeMutation(request, reply, deps, actor.principal, 201, () =>
        deps.service.recordConsent(actor, request.body as ConsentInput, request.id),
      );
    },
  );

  app.post('/v1/privacy/consents/:consentId/withdraw', async (request, reply) => {
    const actor = await actorFor(request, deps.service);
    const { consentId } = request.params as { consentId: string };
    return executeMutation(request, reply, deps, actor.principal, 200, () =>
      deps.service.withdrawConsent(actor, consentId, parseIfMatch(request), request.id),
    );
  });

  app.post(
    '/v1/internal/callbacks/identity/:provider',
    { schema: { body: requestSchemas.identityProviderCallback } },
    async (request, reply) => {
      const signature = request.headers['x-provider-signature'];
      const expected = createHmac('sha256', deps.config.preauthHmacKey)
        .update(JSON.stringify(request.body))
        .digest('hex');
      if (signature !== expected) {
        throw new ApiPolicyError(
          'provider-signature-invalid',
          401,
          'Provider signature is invalid.',
        );
      }
      const body = request.body as ProviderCallbackInput;
      return executeMutation(request, reply, deps, `provider:${body.event_id}`, 200, () =>
        deps.service.providerCallback(body.case_id, body.outcome, request.id),
      );
    },
  );
}

export function installIdentityErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const validation =
      typeof error === 'object' &&
      error !== null &&
      'validation' in error &&
      Array.isArray((error as { validation?: unknown }).validation);
    const policy = error instanceof ApiPolicyError;
    const databaseCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
    const databaseMessage = error instanceof Error ? error.message : '';
    const clientStatus =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode >= 400 &&
          (error as { statusCode: number }).statusCode < 500
          ? (error as { statusCode: number }).statusCode
          : undefined
        : undefined;
    const mappedDatabase =
      databaseCode === '22023'
        ? { code: 'validation-failed', status: 400 }
        : databaseCode === '23505'
          ? { code: 'state-transition-invalid', status: 409 }
          : databaseCode === '40001'
            ? {
                code: databaseMessage.includes('capacity-stale')
                  ? 'capacity-stale'
                  : 'version-conflict',
                status: 409,
              }
            : databaseCode === '42501'
              ? {
                  code: databaseMessage.includes('disabled') ? 'vendor-unavailable' : 'forbidden',
                  status: databaseMessage.includes('disabled') ? 503 : 403,
                }
              : undefined;
    const code = validation
      ? 'validation-failed'
      : policy
        ? error.code
        : (mappedDatabase?.code ?? (clientStatus ? 'validation-failed' : 'internal-error'));
    const status = validation
      ? 400
      : policy
        ? error.status
        : (mappedDatabase?.status ?? clientStatus ?? 500);
    const locale = request.headers['accept-language'] ?? 'ar-EG';
    const shareRequest = request.url.startsWith('/v1/sos/share/');
    const safeInstance = shareRequest
      ? request.url.replace(/(\/v1\/sos\/share\/)[^/?#]+/, '$1[REDACTED]')
      : request.url.replace(/([?&]near=)[^&]*/i, '$1[REDACTED]');
    const detail = validation
      ? 'Check the highlighted fields and try again.'
      : policy
        ? error.message
        : 'The request could not be completed.';
    void reply
      .status(status)
      .type('application/problem+json')
      .headers({
        ...noStoreHeaders,
        ...(shareRequest ? { pragma: 'no-cache', 'referrer-policy': 'no-referrer' } : {}),
        ...(policy ? error.headers : {}),
      })
      .send({
        type: `https://shifaa.test/problems/${code}`,
        title: problemTitle(code, locale),
        status,
        detail,
        code,
        request_id: request.id,
        instance: safeInstance,
        errors: [],
      });
  });
}
