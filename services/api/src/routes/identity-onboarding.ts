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
import { InMemoryIdempotencyStore, preauthPrincipal } from '../platform/idempotency.js';

export const registeredIdentityOnboardingOperationIds = routeCatalog.map(
  ({ operationId }) => operationId,
);

export interface IdentityRouteDependencies {
  config: ApiConfig;
  service: IdentityOnboardingService;
  idempotency: InMemoryIdempotencyStore;
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
      personId: token.slice('synthetic-reviewer:'.length),
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
      return executeMutation(
        request,
        reply,
        deps,
        preauthPrincipal(body.handle, deps.config.preauthHmacKey),
        201,
        () => deps.service.register({ ...body, requestId: request.id }),
      );
    },
  );

  app.post('/v1/auth/login', { schema: { body: requestSchemas.login } }, async (request, reply) => {
    const body = request.body as LoginInput;
    return executeMutation(
      request,
      reply,
      deps,
      preauthPrincipal(body.handle, deps.config.preauthHmacKey),
      200,
      () => deps.service.login(body),
    );
  });

  app.post(
    '/v1/auth/otp/verify',
    { schema: { body: requestSchemas.verifyOtp } },
    async (request, reply) => {
      const body = request.body as OtpVerificationInput;
      return executeMutation(request, reply, deps, body.challenge_id, 200, () =>
        deps.service.verifyOtp({
          challengeId: body.challenge_id,
          code: body.code,
          requestId: request.id,
        }),
      );
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
      return executeMutation(request, reply, deps, actor.principal, 201, () =>
        deps.service.createUpload(actor, caseId, request.body as UploadMetadata),
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
    const code = validation ? 'validation-failed' : policy ? error.code : 'internal-error';
    const status = validation ? 400 : policy ? error.status : 500;
    const locale = request.headers['accept-language'] ?? 'ar-EG';
    const detail = validation
      ? 'Check the highlighted fields and try again.'
      : policy
        ? error.message
        : 'The request could not be completed.';
    void reply
      .status(status)
      .type('application/problem+json')
      .headers(noStoreHeaders)
      .send({
        type: `https://shifaa.test/problems/${code}`,
        title: problemTitle(code, locale),
        status,
        detail,
        code,
        request_id: request.id,
        instance: request.url,
      });
  });
}
