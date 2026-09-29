import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { Value } from '@sinclair/typebox/value';
import type { TransactionSql } from 'postgres';
import {
  PendingSourceReferralProjectionSchema,
  ReferralProjectionSchema,
  ReferralPageSchema,
  type CreateReferralRequest,
  type Feature010Uuid,
  type ListReferralsQuery,
  type PendingSourceReferralProjection,
  type ReferralPage,
  type ReferralProjection,
} from '@shifaa/contracts';

import { ApiPolicyError } from '../../modules/identity-onboarding/errors.js';
import type {
  Feature010ReferralMutationContext,
  Feature010ReferralRepository,
} from '../../modules/feature-010/referrals.js';
import type { Feature010EncounterActor } from '../../modules/feature-010/encounters.js';
import type { PostgresIdentityRepository } from './identity-repository.js';

type RawTransactionRepository = Pick<PostgresIdentityRepository, 'withRawTransaction'>;
type ReferralRole = 'PAT' | 'GUA' | 'DEL' | 'CLN';

interface ReferralCursor {
  readonly version: 1;
  readonly personId: string;
  readonly filterHash: string;
  readonly createdAt: string;
  readonly id: Feature010Uuid;
}

interface ReferralRow {
  readonly referral_id: string;
  readonly created_at: string;
  readonly projection: unknown;
}

function parseJson(raw: unknown): unknown {
  return typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
}

function parseCreateResponse(raw: unknown): PendingSourceReferralProjection {
  const value = parseJson(raw);
  if (!Value.Check(PendingSourceReferralProjectionSchema, value)) {
    throw new Error('Feature 010 createReferral returned an invalid canonical response.');
  }
  return value as PendingSourceReferralProjection;
}

function parseProjection(raw: unknown): ReferralProjection {
  const value = parseJson(raw);
  if (!Value.Check(ReferralProjectionSchema, value)) {
    throw new Error('Feature 010 listReferrals returned an invalid role projection.');
  }
  return value as ReferralProjection;
}

function stableFilters(query: ListReferralsQuery): string {
  return JSON.stringify({
    patientId: query.patientId ?? null,
    facilityId: query.facilityId ?? null,
    specialty: query.specialty?.trim() ?? null,
    status: query.status ?? null,
    date: query.date ?? null,
  });
}

function cursorPayload(raw: string): string {
  const [payload, signature, extra] = raw.split('.');
  if (!payload || !signature || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(payload)) {
    throw new ApiPolicyError('validation-failed', 422, 'The referral cursor is invalid.');
  }
  return payload;
}

function parseCursor(
  cursor: string | undefined,
  key: Buffer,
  actor: Feature010EncounterActor,
  filters: string,
): ReferralCursor | undefined {
  if (cursor === undefined) return undefined;
  if (cursor.length > 512) {
    throw new ApiPolicyError('validation-failed', 422, 'The referral cursor is invalid.');
  }
  const [payload, signature] = cursor.split('.');
  const encoded = cursorPayload(cursor);
  if (!signature || !/^[A-Za-z0-9_-]+$/.test(signature)) {
    throw new ApiPolicyError('validation-failed', 422, 'The referral cursor is invalid.');
  }
  const expected = createHmac('sha256', key).update(encoded).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, 'base64url');
  } catch {
    throw new ApiPolicyError('validation-failed', 422, 'The referral cursor is invalid.');
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new ApiPolicyError('validation-failed', 422, 'The referral cursor is invalid.');
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new ApiPolicyError('validation-failed', 422, 'The referral cursor is invalid.');
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>)['version'] !== 1 ||
    (value as Record<string, unknown>)['personId'] !== actor.personId ||
    (value as Record<string, unknown>)['filterHash'] !==
      createHash('sha256').update(filters).digest('hex') ||
    typeof (value as Record<string, unknown>)['createdAt'] !== 'string' ||
    typeof (value as Record<string, unknown>)['id'] !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      (value as Record<string, unknown>)['id'] as string,
    ) ||
    Number.isNaN(Date.parse((value as Record<string, unknown>)['createdAt'] as string))
  ) {
    throw new ApiPolicyError('validation-failed', 422, 'The referral cursor is invalid.');
  }
  return value as ReferralCursor;
}

function encodeCursor(value: ReferralCursor, key: Buffer): string {
  const payload = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const signature = createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function compareRows(left: ReferralRow, right: ReferralRow): number {
  return left.created_at === right.created_at
    ? right.referral_id.localeCompare(left.referral_id)
    : right.created_at.localeCompare(left.created_at);
}

/** Online access crosses only the fixed C17 SQL entrypoints; it has no table DML. */
export class PostgresFeature010ReferralRepository implements Feature010ReferralRepository {
  private readonly cursorKey: Buffer;

  public constructor(
    private readonly repository: RawTransactionRepository,
    private readonly environment: 'local' | 'ci' | 'production' = 'local',
    cursorSecret: string,
  ) {
    this.cursorKey = createHash('sha256').update(cursorSecret, 'utf8').digest();
  }

  public createReferral(
    context: Feature010ReferralMutationContext,
    sourceEncounterId: Feature010Uuid,
    input: CreateReferralRequest,
  ): Promise<PendingSourceReferralProjection> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.setActor(sql, context.actor, 'createReferral', 'CLN');
      await sql`
        select set_config('shifaa.idempotency_key',${context.idempotencyKey},true),
          set_config('shifaa.request_hash',${context.requestHash},true)
      `;
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.create_referral_api_v1(
          ${sourceEncounterId}::uuid,${sql.json(input)}::jsonb
        ) as response
      `;
      return parseCreateResponse(row?.response);
    });
  }

  public listReferrals(
    actor: Feature010EncounterActor,
    query: ListReferralsQuery,
  ): Promise<ReferralPage> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.setActor(sql, actor, 'listReferrals', 'PAT');
      await sql`select set_config('statement_timeout','5000',true)`;

      const limit = query.limit ?? 25;
      const filters = stableFilters(query);
      const cursor = parseCursor(query.cursor, this.cursorKey, actor, filters);
      const filterHash = createHash('sha256').update(filters).digest('hex');
      const roleRows: ReferralRow[] = [];
      const roles: readonly ReferralRole[] = ['PAT', 'GUA', 'DEL', 'CLN'];

      for (const role of roles) {
        await sql`select set_config('shifaa.actor_role',${role},true)`;
        const rows = await sql<ReferralRow[]>`
          select referral_id,created_at,projection
          from clinical.list_referrals_api_v1(
            ${cursor?.createdAt ?? null}::text,${cursor?.id ?? null}::uuid,${limit + 1},
            ${query.patientId ?? null}::uuid,${query.facilityId ?? null}::uuid,
            ${query.specialty?.trim() ?? null}::text,${query.status ?? null}::text,
            ${query.date ?? null}::date
          )
        `;
        for (const row of rows) {
          parseProjection(row.projection);
          roleRows.push(row);
        }
      }

      const unique = new Map<string, ReferralRow>();
      for (const row of roleRows) {
        if (!unique.has(row.referral_id)) unique.set(row.referral_id, row);
      }
      const ordered = [...unique.values()].sort(compareRows);
      const hasMore = ordered.length > limit;
      const visible = ordered.slice(0, limit);
      const data = visible.map((row) => parseProjection(row.projection));
      const last = visible.at(-1);
      const nextCursor =
        hasMore && last
          ? encodeCursor(
              {
                version: 1,
                personId: actor.personId,
                filterHash,
                createdAt: last.created_at,
                id: last.referral_id as Feature010Uuid,
              },
              this.cursorKey,
            )
          : null;
      const response: ReferralPage = {
        data,
        meta: { nextCursor, lastUpdatedAt: new Date().toISOString(), stale: false },
      };
      if (!Value.Check(ReferralPageSchema, response)) {
        throw new Error('Feature 010 referral page is not a valid API response.');
      }
      return response;
    });
  }

  private setActor(
    sql: TransactionSql,
    actor: Feature010EncounterActor,
    action: 'createReferral' | 'listReferrals',
    role: ReferralRole,
  ) {
    return sql`
      select set_config('shifaa.person_id',${actor.personId},true),
        set_config('shifaa.principal',${actor.principal},true),
        set_config('shifaa.request_id',${actor.requestId},true),
        set_config('shifaa.trace_id',${actor.traceId},true),
        set_config('shifaa.aal',${String(actor.aal)},true),
        set_config('shifaa.actor_role',${role},true),
        set_config('shifaa.action',${action},true),
        set_config('shifaa.purposes',${actor.purposes.join(',')},true),
        set_config('shifaa.environment',${this.environment},true),
        set_config('statement_timeout','5000',true),
        set_config('lock_timeout','2000',true)
    `;
  }
}
