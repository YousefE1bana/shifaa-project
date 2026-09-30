import { createHash } from 'node:crypto';

import { Value } from '@sinclair/typebox/value';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { withFeature010Telemetry } from '@shifaa/observability/feature-010';
import {
  CreateReferralRequestSchema,
  AcceptReferralRequestSchema,
  PendingSourceReferralProjectionSchema,
  ReferralAcceptanceResultSchema,
  ReferralPageSchema,
  ListReferralsQuerySchema,
  feature010Operations,
  type CreateReferralRequest,
  type AcceptReferralRequest,
  type Feature010Uuid,
  type ListReferralsQuery,
} from '@shifaa/contracts';

import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import { hashRequest } from '../platform/idempotency.js';
import type { Feature010ReferralService } from '../modules/feature-010/referrals.js';

export type Feature010ReferralRouteService = Pick<
  Feature010ReferralService,
  'createReferral' | 'listReferrals' | 'acceptReferral'
>;

export interface Feature010ReferralRouteDependencies {
  readonly service: Feature010ReferralRouteService;
  readonly syntheticMode: boolean;
}

export const registeredFeature010ReferralOperationIds = [
  'createReferral',
  'listReferrals',
  'acceptReferral',
] satisfies readonly (typeof feature010Operations)[number]['operationId'][];

const noStore = { 'cache-control': 'private, no-store', pragma: 'no-cache' } as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const syntheticModes = new WeakMap<FastifyInstance, boolean>();

type RequestActor = Parameters<Feature010ReferralRouteService['listReferrals']>[0];

function requireClosed<T>(schema: unknown, value: unknown): T {
  if (!Value.Check(schema as never, value)) {
    throw new ApiPolicyError(
      'validation-failed',
      422,
      'The request does not match the approved contract.',
    );
  }
  return value as T;
}

function actorFor(request: FastifyRequest): RequestActor {
  if (!syntheticModes.get(request.server)) {
    throw new ApiPolicyError(
      'open-sec-001',
      503,
      'Feature 010 referral sessions remain disabled outside seeded-synthetic mode.',
    );
  }
  const token = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice('Bearer '.length)
    : '';
  const person =
    /^synthetic-person:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(
      token,
    );
  if (!person) throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');

  const rawPurposes = request.headers['x-purpose'];
  const purposes =
    typeof rawPurposes === 'string'
      ? [
          ...new Set(
            rawPurposes
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ]
      : [];
  if (purposes.some((purpose) => !/^[a-z][a-z0-9._-]{0,99}$/.test(purpose))) {
    throw new ApiPolicyError('validation-failed', 422, 'The purpose context is invalid.');
  }
  const traceparent = request.headers['traceparent'];
  const parsedTraceId =
    typeof traceparent === 'string'
      ? /^00-([a-f0-9]{32})-[a-f0-9]{16}-[a-f0-9]{2}$/i.exec(traceparent)?.[1]?.toLowerCase()
      : undefined;
  const traceId =
    parsedTraceId ?? createHash('sha256').update(request.id).digest('hex').slice(0, 32);
  return {
    personId: person[1] as Feature010Uuid,
    principal: token,
    requestId: request.id,
    traceId,
    aal: request.headers['x-aal'] === '2' ? 2 : 1,
    locale: request.headers['accept-language'] === 'en-EG' ? 'en-EG' : 'ar-EG',
    purposes,
  };
}

function idempotencyKey(request: FastifyRequest): string {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 16 || key.length > 128) {
    throw new ApiPolicyError('validation-failed', 422, 'Idempotency-Key is required and valid.');
  }
  return key;
}

function resourceVersion(request: FastifyRequest): number {
  const value = request.headers['if-match'];
  if (typeof value !== 'string' || !/^\"[1-9][0-9]*\"$/.test(value)) {
    throw new ApiPolicyError(
      'validation-failed',
      422,
      'A current quoted If-Match version is required.',
    );
  }
  const version = Number(value.slice(1, -1));
  if (!Number.isSafeInteger(version)) {
    throw new ApiPolicyError(
      'validation-failed',
      422,
      'A current quoted If-Match version is required.',
    );
  }
  return version;
}

function parseListQuery(request: FastifyRequest): ListReferralsQuery {
  const raw = request.query;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiPolicyError('validation-failed', 422, 'The referral query is invalid.');
  }
  const query = raw as Record<string, unknown>;
  if (
    Object.keys(query).some(
      (key) =>
        !['cursor', 'limit', 'patientId', 'facilityId', 'specialty', 'status', 'date'].includes(
          key,
        ),
    )
  ) {
    throw new ApiPolicyError('validation-failed', 422, 'The referral query is invalid.');
  }
  const normalized: Record<string, unknown> = { ...query };
  if (typeof normalized['limit'] === 'string' && /^[1-9][0-9]*$/.test(normalized['limit'])) {
    normalized['limit'] = Number(normalized['limit']);
  }
  return requireClosed<ListReferralsQuery>(ListReferralsQuerySchema, normalized);
}

async function invoke<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiPolicyError) throw error;
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { readonly code?: unknown }).code ?? '')
        : '';
    const message = error instanceof Error ? error.message : '';
    if (code === '23505' && message.includes('idempotency key reused')) {
      throw new ApiPolicyError(
        'idempotency-key-reused',
        409,
        'Use a new Idempotency-Key when the request changes.',
      );
    }
    if (code === '55000' && message.includes('already in progress')) {
      throw new ApiPolicyError('idempotency-in-progress', 409, 'The request is still processing.');
    }
    if (
      code === '55000' &&
      (message.includes('encounter is no longer open') ||
        message.includes('linked appointment is no longer in consultation'))
    ) {
      throw new ApiPolicyError(
        'state-transition-invalid',
        409,
        'The source encounter is no longer eligible for a referral.',
      );
    }
    if (
      (code === '40001' || code === '23P01') &&
      (message.includes('schedule') || message.includes('selected slot'))
    ) {
      throw new ApiPolicyError(
        'slot-no-longer-available',
        409,
        'The selected appointment slot is no longer available.',
      );
    }
    if (code === '40001') {
      throw new ApiPolicyError('version-conflict', 409, 'Refresh the referral context and retry.');
    }
    if (code === '42501') {
      throw new ApiPolicyError(
        'forbidden',
        403,
        'The actor or referral context is not authorized.',
      );
    }
    if (code === 'P0002') {
      throw new ApiPolicyError('not-found', 404, 'The requested resource is unavailable.');
    }
    if (['22023', '22007', '22008', '22P02', '23503'].includes(code)) {
      throw new ApiPolicyError('validation-failed', 422, 'The referral request is invalid.');
    }
    throw error;
  }
}

async function acceptReferral(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: Feature010ReferralRouteDependencies,
) {
  const actor = actorFor(request);
  if (actor.aal < 2)
    throw new ApiPolicyError('mfa-required', 403, 'AAL2 is required to accept a referral.');
  if (actor.purposes.length === 0)
    throw new ApiPolicyError('purpose-required', 403, 'A current purpose is required.');
  const { referralId } = request.params as { referralId?: unknown };
  if (typeof referralId !== 'string' || !uuidPattern.test(referralId)) {
    throw new ApiPolicyError('validation-failed', 422, 'The referral identifier is invalid.');
  }
  const version = resourceVersion(request);
  const body = requireClosed<AcceptReferralRequest>(AcceptReferralRequestSchema, request.body);
  const value = await invoke(() =>
    deps.service.acceptReferral(
      { actor, idempotencyKey: idempotencyKey(request), requestHash: hashRequest(body) },
      referralId as Feature010Uuid,
      version,
      body,
    ),
  );
  if (!Value.Check(ReferralAcceptanceResultSchema, value)) {
    throw new ApiPolicyError(
      'internal-error',
      500,
      'The referral acceptance response is unavailable.',
    );
  }
  return reply
    .status(200)
    .headers({ ...noStore, 'content-language': actor.locale, 'x-request-id': request.id })
    .send(value);
}

async function createReferral(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: Feature010ReferralRouteDependencies,
) {
  const actor = actorFor(request);
  if (actor.aal < 2)
    throw new ApiPolicyError('mfa-required', 403, 'AAL2 is required to create a referral.');
  if (actor.purposes.length === 0)
    throw new ApiPolicyError('purpose-required', 403, 'A current purpose is required.');
  const { encounterId } = request.params as { encounterId?: unknown };
  if (typeof encounterId !== 'string' || !uuidPattern.test(encounterId)) {
    throw new ApiPolicyError('validation-failed', 422, 'The encounter identifier is invalid.');
  }
  const body = requireClosed<CreateReferralRequest>(CreateReferralRequestSchema, request.body);
  const requestHash = hashRequest(body);
  if (body.targetSpecialty.trim().length === 0 || body.reasonSummary.trim().length === 0) {
    throw new ApiPolicyError(
      'validation-failed',
      422,
      'A nonblank specialty and reason summary are required.',
    );
  }
  if (body.encounterType !== undefined && body.encounterType.trim().length === 0) {
    throw new ApiPolicyError('validation-failed', 422, 'The encounter type must be nonblank.');
  }
  const input = {
    ...body,
    targetSpecialty: body.targetSpecialty.trim(),
    reasonSummary: body.reasonSummary.trim(),
  };
  const value = await invoke(() =>
    deps.service.createReferral(
      { actor, idempotencyKey: idempotencyKey(request), requestHash },
      encounterId as Feature010Uuid,
      input,
    ),
  );
  if (!Value.Check(PendingSourceReferralProjectionSchema, value)) {
    throw new ApiPolicyError('internal-error', 500, 'The referral response is unavailable.');
  }
  return reply
    .status(201)
    .headers({ ...noStore, 'content-language': actor.locale, 'x-request-id': request.id })
    .send(value);
}

async function listReferrals(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: Feature010ReferralRouteDependencies,
) {
  const actor = actorFor(request);
  if (actor.purposes.length === 0)
    throw new ApiPolicyError('purpose-required', 403, 'A current purpose is required.');
  const query = parseListQuery(request);
  const value = await invoke(() => deps.service.listReferrals(actor, query));
  if (!Value.Check(ReferralPageSchema, value)) {
    throw new ApiPolicyError('internal-error', 500, 'The referral list is unavailable.');
  }
  return reply
    .status(200)
    .headers({ ...noStore, 'content-language': actor.locale, 'x-request-id': request.id })
    .send(value);
}

export async function registerFeature010ReferralRoutes(
  app: FastifyInstance,
  deps: Feature010ReferralRouteDependencies,
): Promise<void> {
  syntheticModes.set(app, deps.syntheticMode);
  app.post('/v1/encounters/:encounterId/referrals', (request, reply) =>
    withFeature010Telemetry(request, reply, 'createReferral', () =>
      createReferral(request, reply, deps),
    ),
  );
  app.get('/v1/referrals', (request, reply) =>
    withFeature010Telemetry(request, reply, 'listReferrals', () =>
      listReferrals(request, reply, deps),
    ),
  );
  app.post('/v1/referrals/:referralId/accept', (request, reply) =>
    withFeature010Telemetry(request, reply, 'acceptReferral', () =>
      acceptReferral(request, reply, deps),
    ),
  );
}
