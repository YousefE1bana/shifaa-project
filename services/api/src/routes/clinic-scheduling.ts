import { createHash } from 'node:crypto';

import { Value } from '@sinclair/typebox/value';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  clinicSchedulingOperations,
  clinicSchedulingRequestSchemas,
  clinicSchedulingResponseSchemas,
  AppointmentListQuerySchema,
  AvailabilityQuerySchema,
  QueueQuerySchema,
  SearchDoctorsQuerySchema,
  type AbsenceInput,
  type AppointmentListQuery,
  type AvailabilityQuery,
  type CancelAppointmentInput,
  type CreateAppointmentInput,
  type CreateScheduleExceptionInput,
  type CreateScheduleInput,
  type DelayInput,
  type QueueQuery,
  type ReorderInput,
  type RescheduleInput,
  type SearchDoctorsQuery,
  type UpdateScheduleInput,
} from '@shifaa/contracts';

import {
  ClinicSchedulingServiceError,
  type ClinicSchedulingService,
} from '../modules/clinic-scheduling/service.js';
import type {
  ClinicSchedulingActor,
  ClinicSchedulingReadFreshness,
  ClinicSchedulingRequestContext,
} from '../modules/clinic-scheduling/types.js';
import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import { hashRequest } from '../platform/idempotency.js';

/** The route boundary is deliberately an injectable view of the application service. */
export type ClinicSchedulingRouteService = Pick<
  ClinicSchedulingService,
  | 'searchDoctors'
  | 'listDoctorAvailability'
  | 'createSchedule'
  | 'updateSchedule'
  | 'createScheduleException'
  | 'listAppointments'
  | 'createAppointment'
  | 'getAppointment'
  | 'cancelAppointment'
  | 'rescheduleAppointment'
  | 'checkInAppointment'
  | 'getQueue'
  | 'getMyQueuePosition'
  | 'callQueueEntry'
  | 'reorderQueueEntry'
  | 'completeQueueEntry'
  | 'sendDoctorDelay'
  | 'declareDoctorAbsence'
>;

export interface ClinicSchedulingRouteDependencies {
  readonly service: ClinicSchedulingRouteService;
  readonly syntheticMode: boolean;
}

export const registeredClinicSchedulingOperationIds = [
  'searchDoctors',
  'listDoctorAvailability',
  'createSchedule',
  'updateSchedule',
  'createScheduleException',
  'listAppointments',
  'createAppointment',
  'getAppointment',
  'cancelAppointment',
  'rescheduleAppointment',
  'checkInAppointment',
  'getQueue',
  'getMyQueuePosition',
  'callQueueEntry',
  'reorderQueueEntry',
  'completeQueueEntry',
  'sendDoctorDelay',
  'declareDoctorAbsence',
] satisfies readonly (typeof clinicSchedulingOperations)[number]['operationId'][];

const noStore = { 'cache-control': 'private, no-store', pragma: 'no-cache' } as const;
const syntheticModes = new WeakMap<FastifyInstance, boolean>();
const rateWindows = new WeakMap<FastifyInstance, Map<string, { count: number; resetAt: number }>>();
const clinicSchedulingRouteKeys = new Set(
  clinicSchedulingOperations.map(
    ({ method, path }) => `${method.toUpperCase()} /v1${path.replaceAll(/\{([^}]+)\}/g, ':$1')}`,
  ),
);

function rejectUnknownFields(schema: unknown, value: unknown): void {
  if (!schema || typeof schema !== 'object' || value === null || typeof value !== 'object') return;
  const shape = schema as {
    readonly additionalProperties?: boolean;
    readonly properties?: Readonly<Record<string, unknown>>;
    readonly items?: unknown;
  };
  if (Array.isArray(value)) {
    for (const item of value) rejectUnknownFields(shape.items, item);
    return;
  }
  if (!shape.properties) return;
  for (const [key, item] of Object.entries(value)) {
    if (!(key in shape.properties)) {
      if (shape.additionalProperties === false) {
        throw new ApiPolicyError('validation-failed', 400, 'Unknown request field.');
      }
      continue;
    }
    rejectUnknownFields(shape.properties[key], item);
  }
}

const uuidParams = (...names: string[]) => ({
  type: 'object',
  additionalProperties: false,
  required: names,
  properties: Object.fromEntries(names.map((name) => [name, { type: 'string', format: 'uuid' }])),
});

const traceId = (request: FastifyRequest): string => {
  const value = request.headers['traceparent'];
  const match =
    typeof value === 'string' ? /^00-([a-f0-9]{32})-[a-f0-9]{16}-[a-f0-9]{2}$/i.exec(value) : null;
  return (
    match?.[1]?.toLowerCase() ?? createHash('sha256').update(request.id).digest('hex').slice(0, 32)
  );
};

const locale = (request: FastifyRequest): 'ar-EG' | 'en-EG' =>
  request.headers['accept-language'] === 'en-EG' ? 'en-EG' : 'ar-EG';

function actorFor(request: FastifyRequest): ClinicSchedulingActor {
  if (!syntheticModes.get(request.server)) {
    throw new ApiPolicyError(
      'open-sec-001',
      503,
      'Clinic scheduling sessions remain disabled outside seeded-synthetic mode.',
    );
  }
  const token = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice(7)
    : '';
  const person =
    /^synthetic-person:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(
      token,
    );
  if (!person) throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
  return {
    personId: person[1]!,
    principal: token,
    requestId: request.id,
    traceId: traceId(request),
    aal: request.headers['x-aal'] === '2' ? 2 : 1,
    locale: locale(request),
  };
}

function networkSubject(request: FastifyRequest): string {
  return createHash('sha256').update(`network:${request.ip}`).digest('hex');
}

function actorSubject(actor: ClinicSchedulingActor): string {
  return createHash('sha256').update(`actor:${actor.personId}`).digest('hex');
}

function consumeRate(request: FastifyRequest, subject: string, limit: number, windowMs: number) {
  let windows = rateWindows.get(request.server);
  if (!windows) {
    windows = new Map();
    rateWindows.set(request.server, windows);
  }
  const now = Date.now();
  for (const [key, bucket] of windows) {
    if (bucket.resetAt <= now) windows.delete(key);
  }
  const key = `${request.routeOptions.url ?? request.url}:${subject}`;
  const existing = windows.get(key);
  const bucket =
    existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  windows.set(key, bucket);
  if (bucket.count > limit) {
    throw new ApiPolicyError('rate-limited', 429, 'Retry after the current rate window.', {
      'retry-after': String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))),
    });
  }
}

function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers['idempotency-key'];
  if (typeof value !== 'string') {
    throw new ApiPolicyError('idempotency-key-required', 400, 'Idempotency-Key is required.');
  }
  if (value.length < 16 || value.length > 128) {
    throw new ApiPolicyError(
      'idempotency-key-invalid',
      400,
      'Idempotency-Key must contain between 16 and 128 characters.',
    );
  }
  return value;
}

function resourceVersion(request: FastifyRequest): number {
  const value = request.headers['if-match'];
  if (typeof value !== 'string' || !/^"[1-9][0-9]*"$/.test(value)) {
    throw new ApiPolicyError('if-match-required', 428, 'If-Match is required.');
  }
  return Number(value.slice(1, -1));
}

function requestContext(request: FastifyRequest, actor: ClinicSchedulingActor, key: string) {
  return {
    actor,
    idempotencyKey: key,
    requestHash: hashRequest({
      params: request.params,
      body: request.body,
      if_match: request.headers['if-match'] ?? null,
    }),
  } satisfies ClinicSchedulingRequestContext;
}

function policyError(error: unknown): Error {
  if (error instanceof ApiPolicyError) return error;
  if (error && typeof error === 'object' && 'code' in error) {
    const databaseError = error as { readonly code?: unknown; readonly message?: unknown };
    if (databaseError.code === '23P01') {
      return new ApiPolicyError(
        'schedule-conflict',
        409,
        'The requested time overlaps existing availability.',
      );
    }
    if (
      databaseError.code === '23505' &&
      typeof databaseError.message === 'string' &&
      databaseError.message.includes('idempotency key reused')
    ) {
      return new ApiPolicyError(
        'idempotency-key-reused',
        409,
        'Use a new Idempotency-Key when the request changes.',
      );
    }
    if (databaseError.code === '40001') {
      return new ApiPolicyError(
        'version-conflict',
        409,
        'Refresh the resource and retry the operation.',
      );
    }
    if (databaseError.code === '42501' || databaseError.code === 'P0002') {
      return new ApiPolicyError('not-found', 404, 'The requested resource is unavailable.');
    }
    if (databaseError.code === '22023') {
      return new ApiPolicyError('validation-failed', 400, 'The request is invalid.');
    }
    if (databaseError.code === 'cursor-invalid') {
      return new ApiPolicyError('cursor-invalid', 400, 'The supplied cursor is invalid.');
    }
  }
  if (!(error instanceof ClinicSchedulingServiceError)) return error as Error;
  const status =
    error.code === 'feature-disabled' ||
    error.code === 'mutations-disabled' ||
    error.code === 'dependency-unavailable'
      ? 503
      : error.code === 'version-conflict'
        ? 409
        : error.code === 'authorization-required'
          ? 401
          : 400;
  return new ApiPolicyError(error.code, status, error.message);
}

async function invoke<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw policyError(error);
  }
}

type ReadResponseMetadata = Readonly<{
  freshness?: ClinicSchedulingReadFreshness;
  degraded?: boolean;
}>;

function responseHeaders(request: FastifyRequest, metadata?: ReadResponseMetadata) {
  return {
    ...noStore,
    'x-request-id': request.id,
    'content-language': locale(request),
    ...(metadata?.freshness ? { 'x-data-freshness': metadata.freshness } : {}),
    ...(metadata?.degraded === undefined
      ? {}
      : { 'x-data-degraded': metadata.degraded ? 'true' : 'false' }),
  };
}

function validateResponse(
  operation: (typeof registeredClinicSchedulingOperationIds)[number],
  body: unknown,
) {
  const schema = clinicSchedulingResponseSchemas[operation];
  if (!Value.Check(schema, body)) {
    throw new ApiPolicyError(
      'response-invalid',
      500,
      `The ${operation} response did not satisfy the generated contract.`,
    );
  }
}

function sendResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  operation: (typeof registeredClinicSchedulingOperationIds)[number],
  body: unknown,
  status = 200,
  metadata?: ReadResponseMetadata,
) {
  validateResponse(operation, body);
  return reply.status(status).headers(responseHeaders(request, metadata)).send(body);
}

async function mutate(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ClinicSchedulingRouteDependencies,
  operation: (typeof registeredClinicSchedulingOperationIds)[number],
  status: 200 | 201,
  work: (context: ClinicSchedulingRequestContext) => Promise<unknown>,
) {
  const actor = actorFor(request);
  consumeRate(request, networkSubject(request), 30, 5 * 60_000);
  consumeRate(request, actorSubject(actor), 30, 5 * 60_000);
  const key = idempotencyKey(request);
  const body = await invoke(async () => {
    const result = await work(requestContext(request, actor, key));
    validateResponse(operation, result);
    return result;
  });
  return reply.status(status).headers(responseHeaders(request)).send(body);
}

function page(cursor: string | undefined) {
  return cursor === undefined ? { limit: 100 } : { cursor, limit: 100 };
}

function notFound(detail: string): never {
  throw new ApiPolicyError('not-found', 404, detail);
}

const bodySchema = (operation: keyof typeof clinicSchedulingRequestSchemas) =>
  clinicSchedulingRequestSchemas[operation];

export async function registerClinicSchedulingRoutes(
  app: FastifyInstance,
  dependencies: ClinicSchedulingRouteDependencies,
): Promise<void> {
  syntheticModes.set(app, dependencies.syntheticMode);
  rateWindows.set(app, new Map());
  app.addHook('preValidation', async (request) => {
    if (!clinicSchedulingRouteKeys.has(`${request.method} ${request.routeOptions.url ?? ''}`))
      return;
    rejectUnknownFields(request.routeOptions.schema?.body, request.body);
    rejectUnknownFields(request.routeOptions.schema?.querystring, request.query);
  });

  app.get(
    '/v1/discovery/doctors',
    { schema: { querystring: SearchDoctorsQuerySchema } } as never,
    async (request, reply) => {
      consumeRate(request, networkSubject(request), 120, 60_000);
      const query = request.query as SearchDoctorsQuery;
      const result = await invoke(() =>
        dependencies.service.searchDoctors(null, query, page(query.cursor)),
      );
      return sendResponse(
        request,
        reply,
        'searchDoctors',
        {
          items: result.items.map((item) => ({
            ...item,
            // Search results already carry item-level freshness.  A cached page
            // is stale as a whole even if the cached projection said otherwise.
            stale: item.stale || result.freshness !== 'fresh',
          })),
          nextCursor: result.nextCursor,
          freshness: result.freshness,
        },
        200,
        result,
      );
    },
  );

  app.get(
    '/v1/clinics/:facilityId/doctors/:doctorId/availability',
    {
      schema: {
        params: uuidParams('facilityId', 'doctorId'),
        querystring: AvailabilityQuerySchema,
      },
    } as never,
    async (request, reply) => {
      consumeRate(request, networkSubject(request), 120, 60_000);
      const params = request.params as { facilityId: string; doctorId: string };
      const query = request.query as AvailabilityQuery;
      const result = await invoke(() =>
        dependencies.service.listDoctorAvailability(
          null,
          params.facilityId,
          params.doctorId,
          { fromDate: query.fromDate, toDate: query.toDate },
          page(query.cursor),
        ),
      );
      return sendResponse(
        request,
        reply,
        'listDoctorAvailability',
        {
          items: result.items.map((slot) => ({
            facilityId: slot.facilityId,
            doctorId: slot.doctorId,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            timezone: slot.timezone,
            civilDate: slot.civilDate,
            ...(slot.delayMinutes === undefined ? {} : { delayMinutes: slot.delayMinutes }),
          })),
          feeMinorUnits: result.feeMinorUnits,
          currency: result.currency,
          paymentMethod: result.paymentMethod,
          nextCursor: result.nextCursor,
          ...(result.generatedAt ? { generatedAt: result.generatedAt } : {}),
          version: result.version,
          freshness: result.freshness,
        },
        200,
        result,
      );
    },
  );

  app.post(
    '/v1/clinics/:facilityId/schedules',
    { schema: { params: uuidParams('facilityId'), body: bodySchema('createSchedule') } } as never,
    async (request, reply) => {
      const params = request.params as { facilityId: string };
      const body = request.body as CreateScheduleInput;
      return mutate(request, reply, dependencies, 'createSchedule', 201, (context) =>
        dependencies.service.createSchedule(context, params.facilityId, body),
      );
    },
  );

  app.patch(
    '/v1/clinics/:facilityId/schedules/:scheduleId',
    {
      schema: {
        params: uuidParams('facilityId', 'scheduleId'),
        body: bodySchema('updateSchedule'),
      },
    } as never,
    async (request, reply) => {
      const params = request.params as { scheduleId: string };
      const body = request.body as UpdateScheduleInput;
      return mutate(request, reply, dependencies, 'updateSchedule', 200, (context) =>
        dependencies.service.updateSchedule(
          context,
          params.scheduleId,
          resourceVersion(request),
          body,
        ),
      );
    },
  );

  app.post(
    '/v1/clinics/:facilityId/schedules/:scheduleId/exceptions',
    {
      schema: {
        params: uuidParams('facilityId', 'scheduleId'),
        body: bodySchema('createScheduleException'),
      },
    } as never,
    async (request, reply) => {
      const params = request.params as { scheduleId: string };
      const body = request.body as CreateScheduleExceptionInput;
      return mutate(request, reply, dependencies, 'createScheduleException', 201, (context) =>
        dependencies.service.createScheduleException(
          context,
          params.scheduleId,
          resourceVersion(request),
          body,
        ),
      );
    },
  );

  app.get(
    '/v1/appointments',
    { schema: { querystring: AppointmentListQuerySchema } } as never,
    async (request, reply) => {
      const actor = actorFor(request);
      consumeRate(request, actorSubject(actor), 120, 60_000);
      const query = request.query as AppointmentListQuery;
      const result = await invoke(() =>
        dependencies.service.listAppointments(actor, query, page(query.cursor)),
      );
      return sendResponse(
        request,
        reply,
        'listAppointments',
        {
          items: result.items,
          nextCursor: result.nextCursor,
          freshness: result.freshness,
        },
        200,
        result,
      );
    },
  );

  app.post(
    '/v1/appointments',
    { schema: { body: bodySchema('createAppointment') } } as never,
    async (request, reply) => {
      const body = request.body as CreateAppointmentInput;
      return mutate(request, reply, dependencies, 'createAppointment', 201, (context) =>
        dependencies.service.createAppointment(context, body.facilityId, body),
      );
    },
  );

  app.get(
    '/v1/appointments/:appointmentId',
    { schema: { params: uuidParams('appointmentId') } } as never,
    async (request, reply) => {
      const actor = actorFor(request);
      consumeRate(request, actorSubject(actor), 120, 60_000);
      const { appointmentId } = request.params as { appointmentId: string };
      const result = await invoke(() => dependencies.service.getAppointment(actor, appointmentId));
      if (!result.value) notFound('Appointment was not found.');
      return sendResponse(request, reply, 'getAppointment', result.value, 200, result);
    },
  );

  app.post(
    '/v1/appointments/:appointmentId/cancel',
    {
      schema: { params: uuidParams('appointmentId'), body: bodySchema('cancelAppointment') },
    } as never,
    async (request, reply) => {
      const { appointmentId } = request.params as { appointmentId: string };
      const body = request.body as CancelAppointmentInput;
      return mutate(request, reply, dependencies, 'cancelAppointment', 200, (context) =>
        dependencies.service.cancelAppointment(
          context,
          appointmentId,
          resourceVersion(request),
          body,
        ),
      );
    },
  );

  app.post(
    '/v1/appointments/:appointmentId/reschedule',
    {
      schema: { params: uuidParams('appointmentId'), body: bodySchema('rescheduleAppointment') },
    } as never,
    async (request, reply) => {
      const { appointmentId } = request.params as { appointmentId: string };
      const body = request.body as RescheduleInput;
      return mutate(request, reply, dependencies, 'rescheduleAppointment', 200, (context) =>
        dependencies.service.rescheduleAppointment(
          context,
          appointmentId,
          resourceVersion(request),
          body,
        ),
      );
    },
  );

  app.post(
    '/v1/appointments/:appointmentId/check-in',
    { schema: { params: uuidParams('appointmentId') } } as never,
    async (request, reply) => {
      const { appointmentId } = request.params as { appointmentId: string };
      return mutate(request, reply, dependencies, 'checkInAppointment', 200, (context) =>
        dependencies.service.checkInAppointment(context, appointmentId, resourceVersion(request)),
      );
    },
  );

  app.get(
    '/v1/clinics/:facilityId/queues',
    { schema: { params: uuidParams('facilityId'), querystring: QueueQuerySchema } } as never,
    async (request, reply) => {
      const actor = actorFor(request);
      consumeRate(request, actorSubject(actor), 120, 60_000);
      const { facilityId } = request.params as { facilityId: string };
      const query = request.query as QueueQuery;
      const result = await invoke(() =>
        dependencies.service.getQueue(
          actor,
          { facilityId, doctorId: query.doctorId, date: query.date },
          page(query.cursor),
        ),
      );
      const queue = result.items[0];
      if (!queue) notFound('Queue was not found.');
      return sendResponse(
        request,
        reply,
        'getQueue',
        { ...queue, nextCursor: result.nextCursor, freshness: result.freshness },
        200,
        result,
      );
    },
  );

  app.get(
    '/v1/appointments/:appointmentId/queue-position',
    { schema: { params: uuidParams('appointmentId') } } as never,
    async (request, reply) => {
      const actor = actorFor(request);
      consumeRate(request, actorSubject(actor), 120, 60_000);
      const { appointmentId } = request.params as { appointmentId: string };
      const result = await invoke(() =>
        dependencies.service.getMyQueuePosition(actor, appointmentId),
      );
      if (!result) notFound('Queue position was not found.');
      return sendResponse(request, reply, 'getMyQueuePosition', result);
    },
  );

  app.post(
    '/v1/queue-entries/:queueEntryId/call',
    { schema: { params: uuidParams('queueEntryId') } } as never,
    async (request, reply) => {
      const { queueEntryId } = request.params as { queueEntryId: string };
      return mutate(request, reply, dependencies, 'callQueueEntry', 200, (context) =>
        dependencies.service.callQueueEntry(context, queueEntryId, resourceVersion(request)),
      );
    },
  );

  app.post(
    '/v1/queue-entries/:queueEntryId/reorder',
    {
      schema: { params: uuidParams('queueEntryId'), body: bodySchema('reorderQueueEntry') },
    } as never,
    async (request, reply) => {
      const { queueEntryId } = request.params as { queueEntryId: string };
      const body = request.body as ReorderInput;
      const expectedVersion = resourceVersion(request);
      if (body.queueVersion !== expectedVersion) {
        throw new ApiPolicyError(
          'version-conflict',
          409,
          'The queueVersion body value must match If-Match.',
        );
      }
      return mutate(request, reply, dependencies, 'reorderQueueEntry', 200, (context) =>
        dependencies.service.reorderQueueEntry(
          context,
          queueEntryId,
          expectedVersion,
          body.targetPosition,
          body.reason,
        ),
      );
    },
  );

  app.post(
    '/v1/queue-entries/:queueEntryId/complete',
    { schema: { params: uuidParams('queueEntryId') } } as never,
    async (request, reply) => {
      const { queueEntryId } = request.params as { queueEntryId: string };
      return mutate(request, reply, dependencies, 'completeQueueEntry', 200, (context) =>
        dependencies.service.completeQueueEntry(context, queueEntryId, resourceVersion(request)),
      );
    },
  );

  app.post(
    '/v1/clinics/:facilityId/doctors/:doctorId/delay',
    {
      schema: { params: uuidParams('facilityId', 'doctorId'), body: bodySchema('sendDoctorDelay') },
    } as never,
    async (request, reply) => {
      const { facilityId, doctorId } = request.params as { facilityId: string; doctorId: string };
      const body = request.body as DelayInput;
      return mutate(request, reply, dependencies, 'sendDoctorDelay', 200, (context) =>
        dependencies.service.sendDoctorDelay(context, facilityId, doctorId, body),
      );
    },
  );

  app.post(
    '/v1/clinics/:facilityId/doctors/:doctorId/absence',
    {
      schema: {
        params: uuidParams('facilityId', 'doctorId'),
        body: bodySchema('declareDoctorAbsence'),
      },
    } as never,
    async (request, reply) => {
      const { facilityId, doctorId } = request.params as { facilityId: string; doctorId: string };
      const body = request.body as AbsenceInput;
      return mutate(request, reply, dependencies, 'declareDoctorAbsence', 200, (context) =>
        dependencies.service.declareDoctorAbsence(context, facilityId, doctorId, body),
      );
    },
  );
}
