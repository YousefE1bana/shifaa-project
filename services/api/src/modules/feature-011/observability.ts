import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { feature011Operations } from '@shifaa/contracts/feature-011';
export interface Feature011Telemetry {
  readonly correlation: string;
  readonly operation: string;
  readonly outcome: 'succeeded' | 'denied' | 'conflict' | 'unavailable';
  readonly durationMs: number;
}
/** Closed, process-local timing records. The sink must be synchronous and must
 * not publish domain events; mutation deduplication belongs to durable outbox. */
export function installFeature011Telemetry(
  app: FastifyInstance,
  emit?: (record: Feature011Telemetry) => void,
): void {
  const starts = new WeakMap<object, { started: number; correlation: string; operation: string }>();
  app.addHook('onRequest', async (request) => {
    const parts = (request.routeOptions.url ?? '').split('/');
    const operation = feature011Operations.find(
      (candidate) =>
        candidate.method.toUpperCase() === request.method &&
        ('/v1' + candidate.path).split('/').length === parts.length &&
        ('/v1' + candidate.path)
          .split('/')
          .every((part, index) =>
            part.startsWith('{') ? parts[index]?.startsWith(':') : part === parts[index],
          ),
    );
    if (operation && emit)
      starts.set(request, {
        started: performance.now(),
        correlation: randomUUID(),
        operation: operation.operationId,
      });
  });
  app.addHook('onResponse', async (request, reply) => {
    const timing = starts.get(request);
    if (!timing || !emit) return;
    starts.delete(request);
    const status = reply.statusCode;
    const outcome =
      status >= 500
        ? 'unavailable'
        : status === 409 || status === 412
          ? 'conflict'
          : status >= 400
            ? 'denied'
            : 'succeeded';
    try {
      emit(
        Object.freeze({
          correlation: timing.correlation,
          operation: timing.operation,
          outcome,
          durationMs: Math.max(0, performance.now() - timing.started),
        }),
      );
    } catch {
      // Telemetry failure cannot invalidate an already committed receipt.
    }
  });
}
