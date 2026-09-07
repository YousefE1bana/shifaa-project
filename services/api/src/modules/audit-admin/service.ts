import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import {
  discloseAggregateRelease,
  validateAggregatePolicy,
  type AggregatePolicyConfiguration,
} from '@shifaa/core/audit-admin/aggregate-policy';

import { ApiPolicyError } from '../identity-onboarding/errors.js';
import { hashRequest } from '../../platform/idempotency.js';
import type {
  AdminSummary,
  AggregateDataPort,
  AggregatePolicyPort,
  AuditAdminActor,
  AuditAdminRepository,
  AuditEventDetail,
  AuditEventCursor,
  AuditEventListQuery,
  AuditEventPage,
  AuditExportAccepted,
  ClockPort,
  CreateAuditExportInput,
} from './types.js';

const AUDIT_PURPOSE = 'security.audit.review';
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_CURSOR_BYTES = 512;
const MAX_FACTOR_AGE_SECONDS = 300;
const MAX_EXPORT_MONTHS = 3;
const MIN_IDEMPOTENCY_KEY_LENGTH = 16;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH_BOUNDARY = /^\d{4}-\d{2}-01$/;
const SAFE_FILTER = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

export type AuditAdminServiceDependencies = {
  repository: AuditAdminRepository;
  policy: AggregatePolicyPort;
  aggregates: AggregateDataPort;
  clock: ClockPort;
  cursorSecret: string;
};

export class AuditAdminService {
  private readonly cursorKey: Buffer;

  public constructor(private readonly dependencies: AuditAdminServiceDependencies) {
    if (Buffer.byteLength(dependencies.cursorSecret, 'utf8') < 32) {
      throw new Error('audit-admin cursor secret must be at least 32 bytes');
    }
    this.cursorKey = createHash('sha256').update(dependencies.cursorSecret, 'utf8').digest();
  }

  public async getAdminSummary(actor: AuditAdminActor): Promise<AdminSummary> {
    this.requireCurrentActor(actor);
    if (!(await this.dependencies.repository.canReadAdminSummary(actor))) this.deny('forbidden');

    const policyValue = await this.dependencies.policy.getApprovedPolicy();
    const runtimeDigest = await this.dependencies.policy.getApprovedRuntimeConfigurationSha256();
    const validation = validateAggregatePolicy(policyValue, runtimeDigest);
    if (!validation.valid || validation.activeMetricCount === 0) {
      this.deny('legal-gate-disabled', 503);
    }

    const policy = policyValue as AggregatePolicyConfiguration;
    const approvedMetricIds = await this.dependencies.repository.approvedAdminSummaryMetricIds(
      actor,
      policy.metrics.map((metric) => metric.metricId),
    );
    if (
      approvedMetricIds.size === 0 ||
      policy.metrics.some((metric) => !approvedMetricIds.has(metric.metricId))
    ) {
      this.deny('legal-gate-disabled', 503);
    }
    const sourceCells = await this.dependencies.aggregates.getCells(policy, approvedMetricIds);
    const disclosure = discloseAggregateRelease(
      policy,
      { cells: sourceCells, requestedOperation: 'summary' },
      runtimeDigest,
    );
    if (disclosure.decision === 'inactive' || disclosure.decision === 'rejected') {
      this.deny('legal-gate-disabled', 503);
    }
    if (disclosure.cells.length > MAX_LIMIT) this.deny('legal-gate-disabled', 503);

    const generatedAt = this.dependencies.clock.now().toISOString();
    const sourceByMetric = new Map(sourceCells.map((cell) => [cell.metricId, cell]));
    return {
      policy_id: 'OPEN-PRIV-001',
      policy_version: '1.0.0-approved',
      data: disclosure.cells.map((cell) => {
        const source = sourceByMetric.get(cell.metricId);
        const period = cell.dimensions['calendar_month_utc'];
        if (!source || !period) this.deny('legal-gate-disabled', 503);
        return {
          metric_id: cell.metricId,
          period,
          dimensions: cell.dimensions,
          disclosure: cell.disclosure,
          ...(cell.disclosure === 'released' && cell.count !== undefined
            ? { distinct_subject_count: cell.count }
            : {}),
          ...(cell.reason
            ? {
                suppression_reason:
                  cell.reason === 'complementary_suppression' ? 'complementary' : cell.reason,
              }
            : {}),
          policy_version: cell.policyVersion,
          snapshot_at: source.snapshotAt,
        };
      }),
      generated_at: generatedAt,
    };
  }

  public async listAuditEvents(
    actor: AuditAdminActor,
    query: AuditEventListQuery,
  ): Promise<AuditEventPage> {
    await this.requireAuditReader(actor);
    const limit = this.limit(query.limit);
    const after = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    this.validateFilters(query);
    const rows = await this.dependencies.repository.listRedactedAuditEvents(actor, {
      ...this.filters(query),
      ...(after ? { after } : {}),
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      data: page,
      meta: {
        next_cursor:
          rows.length > limit && last
            ? this.encodeCursor({ occurredAt: last.occurred_at, eventId: last.event_id })
            : null,
      },
    };
  }

  public async getAuditEvent(actor: AuditAdminActor, eventId: string): Promise<AuditEventDetail> {
    await this.requireAuditReader(actor);
    if (!UUID.test(eventId)) this.deny('validation-failed', 400);
    const event = await this.dependencies.repository.getRedactedAuditEvent(actor, eventId);
    if (!event) this.deny('not-found', 404);
    return { event };
  }

  public async createAuditExport(
    actor: AuditAdminActor,
    input: CreateAuditExportInput,
    idempotencyKey: string,
  ): Promise<AuditExportAccepted> {
    await this.requireAuditReader(actor);
    this.validateExportRequest(input, idempotencyKey);
    return this.dependencies.repository.requestAuditExport(actor, {
      input,
      idempotencyKey,
      requestHash: hashRequest(input),
    });
  }

  private requireCurrentActor(actor: AuditAdminActor): void {
    if (!actor.personId || !actor.principal || !actor.sessionCurrent) {
      this.deny('authentication-required', 401);
    }
  }

  private async requireAuditReader(actor: AuditAdminActor): Promise<void> {
    this.requireCurrentActor(actor);
    if (
      actor.aal !== 2 ||
      actor.factorAgeSeconds === null ||
      actor.factorAgeSeconds < 0 ||
      actor.factorAgeSeconds > MAX_FACTOR_AGE_SECONDS
    ) {
      this.deny('mfa-required');
    }
    if (actor.purpose !== AUDIT_PURPOSE) this.deny('purpose-required', 428);
    if (!(await this.dependencies.repository.canReadAudit(actor))) this.deny('forbidden');
  }

  private limit(value: number | undefined): number {
    const limit = value ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      this.deny('validation-failed', 400);
    }
    return limit;
  }

  private validateFilters(query: AuditEventListQuery): void {
    if (query.actor !== undefined && !UUID.test(query.actor)) {
      this.deny('validation-failed', 400);
    }
    if (query.resourceId !== undefined && !UUID.test(query.resourceId)) {
      this.deny('validation-failed', 400);
    }
    for (const value of [query.action, query.resourceType]) {
      if (value !== undefined && !SAFE_FILTER.test(value)) this.deny('validation-failed', 400);
    }
    for (const value of [query.occurredFrom, query.occurredBefore]) {
      if (value !== undefined && !Number.isFinite(Date.parse(value))) {
        this.deny('validation-failed', 400);
      }
    }
    if (
      query.occurredFrom &&
      query.occurredBefore &&
      Date.parse(query.occurredFrom) >= Date.parse(query.occurredBefore)
    ) {
      this.deny('validation-failed', 400);
    }
  }

  private validateExportRequest(input: CreateAuditExportInput, idempotencyKey: string): void {
    this.validateExportRequestShape(input);
    this.validateIdempotencyKey(idempotencyKey);
    this.validateExportRange(input);
  }

  private validateExportRequestShape(input: CreateAuditExportInput): void {
    if (
      !input ||
      typeof input !== 'object' ||
      Object.keys(input).sort().join(',') !== 'partition_end_exclusive,partition_start' ||
      typeof input.partition_start !== 'string' ||
      typeof input.partition_end_exclusive !== 'string'
    ) {
      this.deny('validation-failed', 400);
    }
  }

  private validateIdempotencyKey(idempotencyKey: string): void {
    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.length < MIN_IDEMPOTENCY_KEY_LENGTH ||
      idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
    ) {
      this.deny('validation-failed', 400);
    }
  }

  private validateExportRange(input: CreateAuditExportInput): void {
    const start = this.monthBoundary(input.partition_start);
    const end = this.monthBoundary(input.partition_end_exclusive);
    const now = this.dependencies.clock.now();
    const currentMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const spanMonths =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      end.getUTCMonth() -
      start.getUTCMonth();
    if (spanMonths < 1 || spanMonths > MAX_EXPORT_MONTHS || end.getTime() > currentMonth) {
      this.deny('export-range-invalid', 409);
    }
  }

  private monthBoundary(value: string): Date {
    if (!MONTH_BOUNDARY.test(value)) this.deny('export-range-invalid', 409);
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      this.deny('export-range-invalid', 409);
    }
    return parsed;
  }

  private filters(query: AuditEventListQuery) {
    return {
      ...(query.actor ? { actor: query.actor } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.occurredFrom ? { occurredFrom: query.occurredFrom } : {}),
      ...(query.occurredBefore ? { occurredBefore: query.occurredBefore } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
    };
  }

  private encodeCursor(cursor: AuditEventCursor): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.cursorKey, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify({ v: 1, t: cursor.occurredAt, i: cursor.eventId }), 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64url');
  }

  private decodeCursor(value: string): AuditEventCursor {
    try {
      if (Buffer.byteLength(value, 'utf8') > MAX_CURSOR_BYTES || !/^[A-Za-z0-9_-]+$/.test(value)) {
        this.deny('validation-failed', 400);
      }
      const packed = Buffer.from(value, 'base64url');
      if (packed.length <= 28) this.deny('validation-failed', 400);
      const decipher = createDecipheriv('aes-256-gcm', this.cursorKey, packed.subarray(0, 12));
      decipher.setAuthTag(packed.subarray(12, 28));
      const parsed = JSON.parse(
        Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8'),
      ) as unknown;
      if (!this.isCursorPayload(parsed)) this.deny('validation-failed', 400);
      return { occurredAt: parsed.t, eventId: parsed.i };
    } catch (error) {
      if (error instanceof ApiPolicyError) throw error;
      this.deny('validation-failed', 400);
    }
  }

  private isCursorPayload(value: unknown): value is { v: 1; t: string; i: string } {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return (
      Object.keys(candidate).length === 3 &&
      candidate['v'] === 1 &&
      typeof candidate['t'] === 'string' &&
      Number.isFinite(Date.parse(candidate['t'])) &&
      typeof candidate['i'] === 'string' &&
      UUID.test(candidate['i'])
    );
  }

  private deny(code: string, status = 403): never {
    throw new ApiPolicyError(code, status, code);
  }
}
