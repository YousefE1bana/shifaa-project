import { createHash } from 'node:crypto';

import { Value } from '@sinclair/typebox/value';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { withFeature010Telemetry } from '@shifaa/observability/feature-010';
import {
  ListContextMessagesQuerySchema,
  MessagePageSchema,
  MessageProjectionSchema,
  SendContextMessageRequestSchema,
  feature010Operations,
  type Feature010Uuid,
  type ListContextMessagesQuery,
  type SendContextMessageRequest,
} from '@shifaa/contracts';

import type {
  Feature010EncounterActor,
  Feature010EncounterMutationContext,
} from '../modules/feature-010/encounters.js';
import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import type { PatientActor } from '../modules/identity-onboarding/service.js';
import { hashRequest } from '../platform/idempotency.js';
import type { Feature010MessagesService } from '../modules/feature-010/messages.js';

export type Feature010MessagesRouteService = Pick<
  Feature010MessagesService,
  'listContextMessages' | 'sendContextMessage'
>;

export interface Feature010MessagesRouteDependencies {
  readonly service: Feature010MessagesRouteService;
  readonly syntheticMode: boolean;
  readonly resolveNativePatient?: (accessToken: string) => Promise<PatientActor | undefined>;
}

export const registeredFeature010MessagesOperationIds = [
  'listContextMessages',
  'sendContextMessage',
] satisfies readonly (typeof feature010Operations)[number]['operationId'][];

const noStore = { 'cache-control': 'private, no-store', pragma: 'no-cache' } as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const syntheticModes = new WeakMap<FastifyInstance, boolean>();

async function actorFor(
  request: FastifyRequest,
  dependencies: Feature010MessagesRouteDependencies,
): Promise<Feature010EncounterActor> {
  if (!syntheticModes.get(request.server)) {
    const accessToken = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice('Bearer '.length)
      : '';
    if (dependencies.resolveNativePatient) {
      if (!accessToken)
        throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
      const patient = await dependencies.resolveNativePatient(accessToken);
      if (!patient)
        throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
      return {
        personId: patient.personId as Feature010Uuid,
        principal: patient.principal,
        requestId: request.id,
        traceId: traceId(request),
        aal: patient.aal,
        locale: request.headers['accept-language'] === 'en-EG' ? 'en-EG' : 'ar-EG',
        purposes: parsePurposes(request.headers['x-purpose']),
      };
    }
    throw new ApiPolicyError(
      'open-sec-001',
      503,
      'Feature 010 messages remain disabled outside approved local and test runtimes.',
    );
  }
  const bearer = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice('Bearer '.length)
    : '';
  const person =
    /^synthetic-person:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(
      bearer,
    );
  if (!person) throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
  return {
    personId: person[1] as Feature010Uuid,
    principal: bearer,
    requestId: request.id,
    traceId: traceId(request),
    aal: request.headers['x-aal'] === '2' ? 2 : 1,
    locale: request.headers['accept-language'] === 'en-EG' ? 'en-EG' : 'ar-EG',
    purposes: parsePurposes(request.headers['x-purpose']),
  };
}

function traceId(request: FastifyRequest): string {
  const value = request.headers['traceparent'];
  return typeof value === 'string'
    ? (/^00-([a-f0-9]{32})-[a-f0-9]{16}-[a-f0-9]{2}$/i.exec(value)?.[1]?.toLowerCase() ??
        createHash('sha256').update(request.id).digest('hex').slice(0, 32))
    : createHash('sha256').update(request.id).digest('hex').slice(0, 32);
}

function parsePurposes(rawPurposes: unknown): string[] {
  const purposes =
    typeof rawPurposes === 'string'
      ? [
          ...new Set(
            rawPurposes
              .split(',')
              .map((purpose) => purpose.trim())
              .filter(Boolean),
          ),
        ]
      : [];
  if (purposes.some((purpose) => !/^[a-z][a-z0-9._-]{0,99}$/.test(purpose))) {
    throw new ApiPolicyError('validation-failed', 422, 'The purpose context is invalid.');
  }
  return purposes;
}

function requireContextId(request: FastifyRequest): Feature010Uuid {
  const { contextType, contextId } = request.params as {
    contextType?: unknown;
    contextId?: unknown;
  };
  if (
    contextType !== 'appointment' ||
    typeof contextId !== 'string' ||
    !uuidPattern.test(contextId)
  ) {
    throw new ApiPolicyError('validation-failed', 422, 'The appointment context is invalid.');
  }
  return contextId as Feature010Uuid;
}

function idempotencyKey(request: FastifyRequest): string {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 16 || key.length > 128) {
    throw new ApiPolicyError('validation-failed', 422, 'Idempotency-Key is required and valid.');
  }
  return key;
}

function parseQuery(request: FastifyRequest): ListContextMessagesQuery {
  const query = request.query;
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw new ApiPolicyError('validation-failed', 422, 'The message query is invalid.');
  }
  const normalized = { ...(query as Record<string, unknown>) };
  if (typeof normalized['limit'] === 'string' && /^[1-9][0-9]*$/.test(normalized['limit'])) {
    normalized['limit'] = Number(normalized['limit']);
  }
  if (!Value.Check(ListContextMessagesQuerySchema, normalized)) {
    throw new ApiPolicyError('validation-failed', 422, 'The message query is invalid.');
  }
  return normalized as ListContextMessagesQuery;
}

function mapDatabaseError(error: unknown): never {
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
  if (code === '55000') {
    throw new ApiPolicyError(
      'state-transition-invalid',
      409,
      'The appointment context is no longer eligible.',
    );
  }
  if (code === '40001')
    throw new ApiPolicyError('version-conflict', 409, 'Refresh the appointment context and retry.');
  if (code === '42501')
    throw new ApiPolicyError(
      'forbidden',
      403,
      'The actor or appointment context is not authorized.',
    );
  if (code === 'P0002')
    throw new ApiPolicyError('not-found', 404, 'The requested resource is unavailable.');
  if (['22023', '22P02', '23503'].includes(code)) {
    throw new ApiPolicyError('validation-failed', 422, 'The message request is invalid.');
  }
  throw error;
}

async function invoke<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    return mapDatabaseError(error);
  }
}

async function listContextMessages(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: Feature010MessagesRouteDependencies,
) {
  const actor = await actorFor(request, dependencies);
  if (actor.purposes.length === 0)
    throw new ApiPolicyError('purpose-required', 403, 'A current purpose is required.');
  const contextId = requireContextId(request);
  const page = await invoke(() =>
    dependencies.service.listContextMessages(actor, 'appointment', contextId, parseQuery(request)),
  );
  if (!Value.Check(MessagePageSchema, page))
    throw new ApiPolicyError('internal-error', 500, 'The message page is unavailable.');
  return reply
    .status(200)
    .headers({ ...noStore, 'content-language': actor.locale, 'x-request-id': request.id })
    .send(page);
}

async function sendContextMessage(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: Feature010MessagesRouteDependencies,
) {
  const actor = await actorFor(request, dependencies);
  if (actor.aal < 2)
    throw new ApiPolicyError('mfa-required', 403, 'AAL2 is required to send appointment messages.');
  if (actor.purposes.length === 0)
    throw new ApiPolicyError('purpose-required', 403, 'A current purpose is required.');
  const contextId = requireContextId(request);
  if (!Value.Check(SendContextMessageRequestSchema, request.body)) {
    throw new ApiPolicyError(
      'validation-failed',
      422,
      'The request does not match the approved message contract.',
    );
  }
  const input = request.body as SendContextMessageRequest;
  if (input.body.trim().length === 0)
    throw new ApiPolicyError('validation-failed', 422, 'A nonblank message body is required.');
  const mutation: Feature010EncounterMutationContext = {
    actor,
    idempotencyKey: idempotencyKey(request),
    requestHash: hashRequest(input),
  };
  const message = await invoke(() =>
    dependencies.service.sendContextMessage(mutation, 'appointment', contextId, input),
  );
  if (!Value.Check(MessageProjectionSchema, message))
    throw new ApiPolicyError('internal-error', 500, 'The message response is unavailable.');
  return reply
    .status(201)
    .headers({ ...noStore, 'content-language': actor.locale, 'x-request-id': request.id })
    .send(message);
}

export async function registerFeature010MessagesRoutes(
  app: FastifyInstance,
  dependencies: Feature010MessagesRouteDependencies,
): Promise<void> {
  syntheticModes.set(app, dependencies.syntheticMode);
  app.get('/v1/contexts/:contextType/:contextId/messages', (request, reply) =>
    withFeature010Telemetry(request, reply, 'listContextMessages', () =>
      listContextMessages(request, reply, dependencies),
    ),
  );
  app.post('/v1/contexts/:contextType/:contextId/messages', (request, reply) =>
    withFeature010Telemetry(request, reply, 'sendContextMessage', () =>
      sendContextMessage(request, reply, dependencies),
    ),
  );
}
