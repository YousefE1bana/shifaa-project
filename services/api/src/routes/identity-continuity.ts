import {
  identityContinuityOperationIds,
  identityContinuityResponseSchemas,
  validatesIdentityContinuityRequest,
  type BeginEnrollmentRequest,
  type CompleteRecoveryRequest,
  type LogoutRequest,
  type RefreshRequest,
  type RemoveFactorRequest,
  type StartRecoveryRequest,
  type TransitionRequest,
  type VerifyEnrollmentRequest,
} from '@shifaa/contracts/identity-continuity';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  HmacRateLimiter,
  scopedPrincipal,
  type ContinuityRequestContext,
  type IdentityContinuityServicePort,
} from '../modules/identity-continuity/index.js';
import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import type { IdempotencyStore } from '../platform/idempotency.js';

export const registeredIdentityContinuityOperationIds = [
  'refreshSession',
  'logout',
  'beginMfaEnrollment',
  'verifyMfaEnrollment',
  'removeMfaFactor',
  'startRecovery',
  'completeRecovery',
  'transitionDependent',
] satisfies readonly (typeof identityContinuityOperationIds)[number][];

const noStore = {
  'cache-control': 'private, no-store',
  pragma: 'no-cache',
  'referrer-policy': 'no-referrer',
} as const;
const refreshCookieName = 'shifaa_refresh';
const csrfCookieName = 'shifaa_csrf';
const pathIdSchema = (name: string) => ({
  type: 'object',
  additionalProperties: false,
  required: [name],
  properties: { [name]: { type: 'string', format: 'uuid' } },
});

const validateBody =
  (operationId: (typeof identityContinuityOperationIds)[number]) =>
  async (request: FastifyRequest) => {
    if (!validatesIdentityContinuityRequest(operationId, request.body)) {
      throw new ApiPolicyError('validation-failed', 400, 'Check the request fields and try again.');
    }
  };

export interface IdentityContinuityRouteDependencies {
  service: IdentityContinuityServicePort;
  idempotency: IdempotencyStore;
  hmacKey: Uint8Array;
  now?: () => number;
}

function cookies(request: FastifyRequest): Readonly<Record<string, string>> {
  const header = request.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').flatMap((entry) => {
      const separator = entry.indexOf('=');
      if (separator < 1) return [];
      const name = entry.slice(0, separator).trim();
      const encoded = entry.slice(separator + 1).trim();
      try {
        return [[name, decodeURIComponent(encoded)]];
      } catch {
        throw new ApiPolicyError('validation-failed', 400, 'A session cookie is malformed.');
      }
    }),
  );
}

function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers['idempotency-key'];
  if (typeof value !== 'string' || value.length < 16 || value.length > 128) {
    throw new ApiPolicyError(
      'idempotency-key-required',
      400,
      'A 16 to 128 character Idempotency-Key is required.',
    );
  }
  return value;
}

function accessToken(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
}

function expectedVersion(request: FastifyRequest): number {
  const value = request.headers['if-match'];
  if (typeof value !== 'string' || !/^"[1-9][0-9]*"$/.test(value)) {
    throw new ApiPolicyError(
      'version-conflict',
      409,
      'A current quoted If-Match version is required.',
    );
  }
  return Number(value.slice(1, -1));
}

function requestContext(request: FastifyRequest): ContinuityRequestContext {
  const parsedCookies = cookies(request);
  const token = accessToken(request);
  return {
    requestId: request.id,
    idempotencyKey: idempotencyKey(request),
    ...(token ? { accessToken: token } : {}),
    ...(parsedCookies[refreshCookieName]
      ? { refreshCookie: parsedCookies[refreshCookieName] }
      : {}),
    ...(parsedCookies[csrfCookieName] ? { csrfCookie: parsedCookies[csrfCookieName] } : {}),
    ...(typeof request.headers['x-csrf-token'] === 'string'
      ? { csrfHeader: request.headers['x-csrf-token'] }
      : {}),
    ...(typeof request.headers.origin === 'string' ? { origin: request.headers.origin } : {}),
    ...(typeof request.headers['sec-fetch-site'] === 'string'
      ? { fetchSite: request.headers['sec-fetch-site'] }
      : {}),
  };
}

function responseHeaders(request: FastifyRequest) {
  return {
    ...noStore,
    'x-request-id': request.id,
    'content-language': request.headers['accept-language'] === 'en-EG' ? 'en-EG' : 'ar-EG',
  };
}

function setRefreshCookie(reply: FastifyReply, refreshToken: string): void {
  reply.header(
    'set-cookie',
    `${refreshCookieName}=${encodeURIComponent(refreshToken)}; Path=/v1/auth; Max-Age=85500; HttpOnly; Secure; SameSite=Strict`,
  );
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.header(
    'set-cookie',
    `${refreshCookieName}=; Path=/v1/auth; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
  );
}

function rateLimit(
  limiter: HmacRateLimiter,
  reply: FastifyReply,
  operation: string,
  subject: string,
  limit: number,
  windowMs: number,
): void {
  const retryAfter = limiter.consume(operation, subject, limit, windowMs);
  if (retryAfter === null) return;
  reply.header('retry-after', String(retryAfter));
  throw new ApiPolicyError('rate-limited', 429, 'The security request limit was reached.');
}

async function idempotentMutation(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: IdentityContinuityRouteDependencies,
  principal: string,
  work: () => Promise<unknown>,
  retentionMs = 24 * 60 * 60_000,
) {
  const stored = await dependencies.idempotency.execute({
    principal,
    method: request.method,
    route: request.routeOptions.url ?? request.url,
    key: idempotencyKey(request),
    body: {
      params: request.params,
      body: request.body,
      ifMatch: request.headers['if-match'] ?? null,
    },
    retentionMs,
    work: async () => ({ status: 200, headers: responseHeaders(request), body: await work() }),
  });
  return reply.status(stored.status).headers(stored.headers).send(stored.body);
}

export async function registerIdentityContinuityRoutes(
  app: FastifyInstance,
  dependencies: IdentityContinuityRouteDependencies,
): Promise<void> {
  const limiter = new HmacRateLimiter(dependencies.hmacKey, dependencies.now ?? Date.now);

  app.post(
    '/v1/auth/session/refresh',
    {
      schema: {
        response: { 200: identityContinuityResponseSchemas.refreshSession },
      },
      preValidation: validateBody('refreshSession'),
    },
    async (request, reply) => {
      const body = request.body as RefreshRequest;
      const context = requestContext(request);
      const refreshSubject =
        body.client === 'native'
          ? body.refreshToken
          : (context.refreshCookie ?? 'missing-web-cookie');
      rateLimit(limiter, reply, 'refreshSession', refreshSubject, 12, 5 * 60_000);
      const session = await dependencies.service.refreshSession(context, body);
      const response = { ...session };
      if (body.client === 'web' && session.refreshToken) {
        setRefreshCookie(reply, session.refreshToken);
        delete response.refreshToken;
      }
      return reply.headers(responseHeaders(request)).send(response);
    },
  );

  app.post(
    '/v1/auth/logout',
    {
      schema: {
        response: { 200: identityContinuityResponseSchemas.logout },
      },
      preValidation: validateBody('logout'),
    },
    async (request, reply) => {
      const context = requestContext(request);
      const token = context.accessToken ?? 'missing-access-token';
      rateLimit(limiter, reply, 'logout', token, 10, 5 * 60_000);
      clearRefreshCookie(reply);
      const stored = await dependencies.idempotency.execute({
        principal: scopedPrincipal('logout', token, dependencies.hmacKey),
        method: request.method,
        route: request.routeOptions.url ?? request.url,
        key: idempotencyKey(request),
        body: request.body,
        prepare: () => dependencies.service.prepareLogout(context, request.body as LogoutRequest),
        work: async (prepared) => ({
          status: 200,
          headers: responseHeaders(request),
          body: await dependencies.service.commitLogout(prepared),
        }),
      });
      return reply.status(200).headers(stored.headers).send(stored.body);
    },
  );

  app.post(
    '/v1/auth/mfa/enroll',
    {
      schema: {
        response: { 200: identityContinuityResponseSchemas.beginMfaEnrollment },
      },
      preValidation: validateBody('beginMfaEnrollment'),
    },
    (request, reply) => {
      const context = requestContext(request);
      const token = context.accessToken ?? 'missing-access-token';
      rateLimit(limiter, reply, 'beginMfaEnrollment', token, 3, 60 * 60_000);
      return idempotentMutation(
        request,
        reply,
        dependencies,
        scopedPrincipal('beginMfaEnrollment', token, dependencies.hmacKey),
        () =>
          dependencies.service.beginMfaEnrollment(context, request.body as BeginEnrollmentRequest),
        10 * 60_000,
      );
    },
  );

  app.post(
    '/v1/auth/mfa/enroll/verify',
    {
      schema: {
        response: { 200: identityContinuityResponseSchemas.verifyMfaEnrollment },
      },
      preValidation: validateBody('verifyMfaEnrollment'),
    },
    (request, reply) => {
      const context = requestContext(request);
      const body = request.body as VerifyEnrollmentRequest;
      const token = context.accessToken ?? 'missing-access-token';
      rateLimit(limiter, reply, 'verifyMfaEnrollment', body.enrollmentId, 5, 10 * 60_000);
      return idempotentMutation(
        request,
        reply,
        dependencies,
        scopedPrincipal('verifyMfaEnrollment', token, dependencies.hmacKey),
        () => dependencies.service.verifyMfaEnrollment(context, body),
      );
    },
  );

  app.delete(
    '/v1/auth/mfa/factors/:factorId',
    {
      schema: {
        params: pathIdSchema('factorId'),
        response: { 200: identityContinuityResponseSchemas.removeMfaFactor },
      },
      preValidation: validateBody('removeMfaFactor'),
    },
    (request, reply) => {
      const context = requestContext(request);
      const token = context.accessToken ?? 'missing-access-token';
      rateLimit(limiter, reply, 'removeMfaFactor', token, 3, 60 * 60_000);
      return idempotentMutation(
        request,
        reply,
        dependencies,
        scopedPrincipal('removeMfaFactor', token, dependencies.hmacKey),
        () =>
          dependencies.service.removeMfaFactor(
            context,
            (request.params as { factorId: string }).factorId,
            request.body as RemoveFactorRequest,
          ),
      );
    },
  );

  app.post(
    '/v1/auth/recovery',
    {
      schema: {
        response: { 202: identityContinuityResponseSchemas.startRecovery },
      },
      preValidation: validateBody('startRecovery'),
    },
    async (request, reply) => {
      const context = requestContext(request);
      const body = request.body as StartRecoveryRequest;
      rateLimit(limiter, reply, 'startRecovery', body.handle, 5, 15 * 60_000);
      const stored = await dependencies.idempotency.execute({
        principal: scopedPrincipal('startRecovery', body.handle, dependencies.hmacKey),
        method: request.method,
        route: request.routeOptions.url ?? request.url,
        key: idempotencyKey(request),
        body,
        work: async () => ({
          status: 202,
          headers: responseHeaders(request),
          body: await dependencies.service.startRecovery(context, body),
        }),
      });
      return reply.status(202).headers(stored.headers).send(stored.body);
    },
  );

  app.post(
    '/v1/auth/recovery/:caseId/complete',
    {
      schema: {
        params: pathIdSchema('caseId'),
        response: { 200: identityContinuityResponseSchemas.completeRecovery },
      },
      preValidation: validateBody('completeRecovery'),
    },
    (request, reply) => {
      const context = requestContext(request);
      const body = request.body as CompleteRecoveryRequest;
      rateLimit(limiter, reply, 'completeRecovery', body.caseToken, 5, 15 * 60_000);
      return idempotentMutation(
        request,
        reply,
        dependencies,
        scopedPrincipal('completeRecovery', body.caseToken, dependencies.hmacKey),
        () =>
          dependencies.service.completeRecovery(
            context,
            (request.params as { caseId: string }).caseId,
            body,
          ),
      );
    },
  );

  app.post(
    '/v1/guardianships/:relationshipId/transition',
    {
      schema: {
        params: pathIdSchema('relationshipId'),
        response: { 200: identityContinuityResponseSchemas.transitionDependent },
      },
      preValidation: validateBody('transitionDependent'),
    },
    (request, reply) => {
      const context = requestContext(request);
      const token = context.accessToken ?? 'missing-access-token';
      const body = request.body as TransitionRequest;
      rateLimit(
        limiter,
        reply,
        body.action === 'decide' ? 'transitionDecision' : 'transitionSubmission',
        token,
        body.action === 'decide' ? 30 : 3,
        body.action === 'decide' ? 60 * 60_000 : 24 * 60 * 60_000,
      );
      return idempotentMutation(
        request,
        reply,
        dependencies,
        scopedPrincipal('transitionDependent', token, dependencies.hmacKey),
        () =>
          dependencies.service.transitionDependent(
            context,
            (request.params as { relationshipId: string }).relationshipId,
            body,
            expectedVersion(request),
          ),
      );
    },
  );
}
