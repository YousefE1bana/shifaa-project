import { createHash } from 'node:crypto';

import { Value } from '@sinclair/typebox/value';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateEncounterRequestSchema,
  EncounterProjectionSchema,
  EncounterStartResultSchema,
  GetEncounterQuerySchema,
  UpdateEncounterRequestSchema,
  feature010Operations,
  type CreateEncounterRequest,
  type EncounterProjection,
  type Feature010Uuid,
  type GetEncounterQuery,
  type UpdateEncounterRequest,
} from '@shifaa/contracts';

import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import { hashRequest } from '../platform/idempotency.js';
import type { Feature010EncounterService } from '../modules/feature-010/encounters.js';

export type Feature010EncounterRouteService = Pick<
  Feature010EncounterService,
  'createEncounter' | 'getEncounter' | 'updateEncounter'
>;

export interface Feature010EncounterRouteDependencies {
  readonly service: Feature010EncounterRouteService;
  readonly syntheticMode: boolean;
}

export const registeredFeature010EncounterOperationIds = [
  'createEncounter',
  'getEncounter',
  'updateEncounter',
] satisfies readonly (typeof feature010Operations)[number]['operationId'][];

const noStore = { 'cache-control': 'private, no-store', pragma: 'no-cache' } as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const syntheticModes = new WeakMap<FastifyInstance, boolean>();

type RequestActor = Parameters<Feature010EncounterRouteService['getEncounter']>[0];

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
      'Feature 010 sessions remain disabled outside seeded-synthetic mode.',
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
  if (typeof key !== 'string') {
    throw new ApiPolicyError('validation-failed', 422, 'Idempotency-Key is required.');
  }
  if (key.length < 16 || key.length > 128) {
    throw new ApiPolicyError('validation-failed', 422, 'Idempotency-Key is invalid.');
  }
  return key;
}

function parseFields(request: FastifyRequest): GetEncounterQuery['fields'] {
  const raw = request.query;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiPolicyError('validation-failed', 422, 'The encounter query is invalid.');
  }
  const query = raw as Record<string, unknown>;
  if (Object.keys(query).some((key) => key !== 'fields')) {
    throw new ApiPolicyError('validation-failed', 422, 'The encounter query is invalid.');
  }
  const value = query['fields'];
  const fields =
    value === undefined
      ? undefined
      : Array.isArray(value)
        ? value
        : typeof value === 'string'
          ? value.split(',')
          : value;
  const normalized = fields === undefined ? {} : { fields };
  return requireClosed<GetEncounterQuery>(GetEncounterQuerySchema, normalized).fields;
}

function responseHeaders(request: FastifyRequest) {
  return {
    ...noStore,
    'x-request-id': request.id,
    'content-language': request.headers['accept-language'] === 'en-EG' ? 'en-EG' : 'ar-EG',
  };
}

function selectEncounterProjection(
  projection: EncounterProjection,
  fields: GetEncounterQuery['fields'],
): EncounterProjection {
  const selectedProjection = { ...projection } as unknown as Record<string, unknown>;
  delete selectedProjection['notes'];
  if (fields !== undefined) {
    const selectedFields = new Set(fields);
    if (!selectedFields.has('conditions')) delete selectedProjection['conditionIds'];
    if (!selectedFields.has('observations')) delete selectedProjection['observationIds'];
    if (!selectedFields.has('orders')) delete selectedProjection['orderIds'];
    if (!selectedFields.has('participants')) delete selectedProjection['participants'];
  }
  return selectedProjection as unknown as EncounterProjection;
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
      throw new ApiPolicyError(
        'idempotency-in-progress',
        409,
        'The request is still being processed.',
      );
    }
    if (
      code === '55000' &&
      (message.includes('encounter is no longer open') ||
        message.includes('participant interval is no longer active'))
    ) {
      throw new ApiPolicyError(
        'state-transition-invalid',
        409,
        'The encounter or participant interval is no longer active.',
      );
    }
    if (
      code === '40001' &&
      (message.includes('matching called queue entry is required') ||
        message.includes('appointment is no longer eligible for encounter creation') ||
        message.includes('appointment already has an open encounter'))
    ) {
      throw new ApiPolicyError(
        'state-transition-invalid',
        409,
        'The appointment is no longer eligible to start an encounter.',
      );
    }
    if (code === '40001')
      throw new ApiPolicyError('version-conflict', 409, 'Refresh the encounter context and retry.');
    if (code === '42501')
      throw new ApiPolicyError(
        'forbidden',
        403,
        'The actor or encounter context is not authorized.',
      );
    if (code === 'P0002')
      throw new ApiPolicyError('not-found', 404, 'The requested resource is unavailable.');
    if (code === '22023')
      throw new ApiPolicyError('validation-failed', 422, 'The request is invalid.');
    throw error;
  }
}

async function createEncounter(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: Feature010EncounterRouteDependencies,
) {
  const actor = actorFor(request);
  if (actor.aal < 2)
    throw new ApiPolicyError('mfa-required', 403, 'AAL2 is required for encounter creation.');
  if (actor.purposes.length === 0)
    throw new ApiPolicyError('purpose-required', 403, 'A current purpose is required.');
  const body = requireClosed<CreateEncounterRequest>(CreateEncounterRequestSchema, request.body);
  const key = idempotencyKey(request);
  const value = await invoke(() =>
    deps.service.createEncounter(
      { actor, idempotencyKey: key, requestHash: hashRequest(body) },
      body,
    ),
  );
  if (!Value.Check(EncounterStartResultSchema, value)) {
    throw new ApiPolicyError('internal-error', 500, 'The encounter response is unavailable.');
  }
  return reply.status(201).headers(responseHeaders(request)).send(value);
}

async function getEncounter(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: Feature010EncounterRouteDependencies,
) {
  const actor = actorFor(request);
  if (actor.purposes.length === 0)
    throw new ApiPolicyError('purpose-required', 403, 'A current purpose is required.');
  const { encounterId } = request.params as { encounterId?: unknown };
  if (typeof encounterId !== 'string' || !uuidPattern.test(encounterId)) {
    throw new ApiPolicyError('validation-failed', 422, 'The encounter identifier is invalid.');
  }
  const fields = parseFields(request);
  if (fields?.includes('notes')) {
    throw new ApiPolicyError(
      'dependency-unavailable',
      503,
      'The authorized encounter note body projection is unavailable in this checkpoint.',
    );
  }
  const projection = await invoke(() =>
    deps.service.getEncounter(actor, encounterId as Feature010Uuid, fields),
  );
  if (projection === null)
    throw new ApiPolicyError('not-found', 404, 'The requested resource is unavailable.');
  const value = selectEncounterProjection(projection, fields);
  if (!Value.Check(EncounterProjectionSchema, value)) {
    throw new ApiPolicyError('internal-error', 500, 'The encounter projection is unavailable.');
  }
  return reply.status(200).headers(responseHeaders(request)).send(value);
}

async function updateEncounter(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: Feature010EncounterRouteDependencies,
) {
  const actor = actorFor(request);
  if (actor.aal < 2)
    throw new ApiPolicyError('mfa-required', 403, 'AAL2 is required for encounter updates.');
  if (actor.purposes.length === 0)
    throw new ApiPolicyError('purpose-required', 403, 'A current purpose is required.');
  const { encounterId } = request.params as { encounterId?: unknown };
  if (typeof encounterId !== 'string' || !uuidPattern.test(encounterId)) {
    throw new ApiPolicyError('validation-failed', 422, 'The encounter identifier is invalid.');
  }
  const body = requireClosed<UpdateEncounterRequest>(UpdateEncounterRequestSchema, request.body);
  const key = idempotencyKey(request);
  const expectedVersion = resourceVersion(request);
  const value = await invoke(() =>
    deps.service.updateEncounter(
      {
        actor,
        idempotencyKey: key,
        // The approved C10 replay contract binds a key to the canonical request body;
        // an exact retry replays before checking its now-stale If-Match version.
        requestHash: hashRequest(body),
        expectedVersion,
      },
      encounterId as Feature010Uuid,
      body,
    ),
  );
  if (!Value.Check(EncounterProjectionSchema, value)) {
    throw new ApiPolicyError('internal-error', 500, 'The encounter response is unavailable.');
  }
  return reply
    .status(200)
    .headers(responseHeaders(request))
    .send(selectEncounterProjection(value, undefined));
}

export async function registerFeature010EncounterRoutes(
  app: FastifyInstance,
  deps: Feature010EncounterRouteDependencies,
): Promise<void> {
  syntheticModes.set(app, deps.syntheticMode);
  app.post('/v1/encounters', (request, reply) => createEncounter(request, reply, deps));
  app.get('/v1/encounters/:encounterId', (request, reply) => getEncounter(request, reply, deps));
  app.patch('/v1/encounters/:encounterId', (request, reply) =>
    updateEncounter(request, reply, deps),
  );
}
