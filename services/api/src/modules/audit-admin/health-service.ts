import { auditAdminTelemetry, type AuditAdminTelemetry } from '@shifaa/observability/audit-admin';

import { ApiPolicyError } from '../identity-onboarding/errors.js';
import type {
  AuditExportServiceActor,
  ClockPort,
  LivenessResponse,
  ReadinessPort,
  ReadinessResponse,
  ReadinessSnapshot,
} from './types.js';

export interface HealthIntegrityPort {
  auditIntegrity(): Promise<'ready' | 'failed'>;
  exportProof(): Promise<'ready' | 'failed'>;
}

export interface HealthTelemetryPort {
  emit(event: AuditAdminTelemetry): void;
}

export type AuditAdminHealthServiceDependencies = {
  readiness: ReadinessPort;
  integrity: HealthIntegrityPort;
  clock: ClockPort;
  telemetry?: HealthTelemetryPort;
  timeoutMs?: number;
};

const platformProbePrincipal = 'service:platform-probe';

export class AuditAdminHealthService {
  private readonly timeoutMs: number;

  public constructor(private readonly dependencies: AuditAdminHealthServiceDependencies) {
    const timeoutMs = dependencies.timeoutMs ?? 500;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5_000)
      throw new TypeError('Health timeout must be a bounded positive integer.');
    this.timeoutMs = timeoutMs;
  }

  public healthLive(actor: AuditExportServiceActor): LivenessResponse {
    this.requirePlatformProbe(actor);
    const response = { status: 'live' as const, observed_at: this.observedAt() };
    this.emit(actor, 'healthLive', 'succeeded');
    return response;
  }

  public async healthReady(actor: AuditExportServiceActor): Promise<ReadinessResponse> {
    this.requirePlatformProbe(actor);
    const [snapshot, auditIntegrity, exportProof] = await Promise.all([
      within(() => this.dependencies.readiness.readiness(), this.timeoutMs, null),
      within(() => this.dependencies.integrity.auditIntegrity(), this.timeoutMs, 'failed' as const),
      within(() => this.dependencies.integrity.exportProof(), this.timeoutMs, 'failed' as const),
    ]);
    const reasons: ReadinessResponse['reasons'][number][] = [];
    if (!isReadinessSnapshot(snapshot) || snapshot.database !== 'ready')
      reasons.push('database_unavailable');
    if (snapshot?.outbox === 'backlogged') reasons.push('outbox_backlog');
    if (snapshot?.outbox === 'integrity_failed') reasons.push('outbox_integrity_failed');
    if (auditIntegrity !== 'ready') reasons.push('audit_integrity_failed');
    if (exportProof !== 'ready') reasons.push('export_proof_failed');

    const status = reasons.some((reason) => reason !== 'outbox_backlog')
      ? 'not_ready'
      : reasons.length > 0
        ? 'degraded'
        : 'ready';
    const response: ReadinessResponse = {
      status,
      reasons,
      observed_at: this.observedAt(),
    };
    this.emit(actor, 'healthReady', status, reasons[0]);
    return response;
  }

  private requirePlatformProbe(actor: AuditExportServiceActor): void {
    if (!actor.authenticated)
      throw new ApiPolicyError(
        'authentication-required',
        401,
        'Service authentication is required.',
      );
    if (actor.principal !== platformProbePrincipal || actor.workerId !== null)
      throw new ApiPolicyError('forbidden', 403, 'The service principal is not permitted.');
  }

  private observedAt(): string {
    return this.dependencies.clock.now().toISOString();
  }

  private emit(
    actor: AuditExportServiceActor,
    operation: 'healthLive' | 'healthReady',
    outcome: 'succeeded' | 'ready' | 'degraded' | 'not_ready',
    reason?: ReadinessResponse['reasons'][number],
  ): void {
    this.dependencies.telemetry?.emit(
      auditAdminTelemetry({
        requestId: actor.requestId,
        traceId: actor.traceId,
        surface: 'health',
        operation,
        outcome,
        ...(reason === undefined ? {} : { reason }),
      }),
    );
  }
}

function isReadinessSnapshot(value: ReadinessSnapshot | null): value is ReadinessSnapshot {
  if (value === null) return false;
  if (value.status === 'ready') return value.database === 'ready' && value.outbox === 'ready';
  if (value.status === 'degraded')
    return value.database === 'ready' && value.outbox === 'backlogged';
  if (value.status === 'not_ready')
    return value.database === 'unavailable' || value.outbox === 'integrity_failed';
  return false;
}

async function within<T>(work: () => Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve()
        .then(work)
        .catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
