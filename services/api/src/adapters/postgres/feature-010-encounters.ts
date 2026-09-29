import type { TransactionSql } from 'postgres';
import { Value } from '@sinclair/typebox/value';
import {
  EncounterProjectionSchema,
  EncounterStartResultSchema,
  type CreateEncounterRequest,
  type EncounterProjection,
  type EncounterStartResult,
  type Feature010Uuid,
} from '@shifaa/contracts';

import type {
  EncounterFields,
  Feature010EncounterActor,
  Feature010EncounterMutationContext,
  Feature010EncounterRepository,
} from '../../modules/feature-010/encounters.js';
import type { PostgresIdentityRepository } from './identity-repository.js';

type RawTransactionRepository = Pick<PostgresIdentityRepository, 'withRawTransaction'>;

function parseProjection(raw: unknown): EncounterProjection {
  let value = raw;
  if (typeof value === 'string') value = JSON.parse(value) as unknown;
  if (!Value.Check(EncounterProjectionSchema, value)) {
    throw new Error('Feature 010 encounter projection is not a valid API response.');
  }
  return value as EncounterProjection;
}

function parseCreateResponse(raw: unknown): EncounterStartResult {
  let value = raw;
  if (typeof value === 'string') value = JSON.parse(value) as unknown;
  if (!Value.Check(EncounterStartResultSchema, value)) {
    throw new Error('Feature 010 createEncounter returned an invalid canonical response.');
  }
  return value as EncounterStartResult;
}

/** Online access crosses only the fixed F010 SQL entrypoints; this adapter has no table DML. */
export class PostgresFeature010EncounterRepository implements Feature010EncounterRepository {
  public constructor(
    private readonly repository: RawTransactionRepository,
    private readonly environment: 'local' | 'ci' | 'production' = 'local',
  ) {}

  public async createEncounter(
    context: Feature010EncounterMutationContext,
    input: CreateEncounterRequest,
  ): Promise<EncounterStartResult> {
    return this.withActor(context.actor, 'createEncounter', 'CLN', async (sql) => {
      await sql`
        select set_config('shifaa.idempotency_key',${context.idempotencyKey},true),
          set_config('shifaa.request_hash',${context.requestHash},true)
      `;
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.create_encounter_api_v1(${sql.json(input)}::jsonb) as response
      `;
      return parseCreateResponse(row?.response);
    });
  }

  public async getEncounter(
    actor: Feature010EncounterActor,
    encounterId: Feature010Uuid,
    fields?: EncounterFields,
  ): Promise<EncounterProjection | null> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.setActor(sql, actor, 'getEncounter', 'PAT');
      // The signed synthetic session contains a person, not an asserted workforce/family role.
      // Probe only server-controlled C07 roles; each projection call rechecks live authority.
      // The common encounter/participant fields are returned only after one such check succeeds.
      for (const role of ['PAT', 'GUA', 'DEL', 'CLN'] as const) {
        await sql`select set_config('shifaa.actor_role',${role},true)`;
        const [row] = await sql<{ projection: unknown }[]>`
          select clinical.feature_010_get_encounter_projection_v1(${encounterId}::uuid) as projection
        `;
        if (row?.projection !== null && row?.projection !== undefined) {
          const value =
            typeof row.projection === 'string'
              ? (JSON.parse(row.projection) as Record<string, unknown>)
              : (row.projection as Record<string, unknown>);
          // C07 currently exposes note metadata, not authorized decrypted bodies. Keep this
          // response within the current metadata-only boundary until the note API checkpoint.
          delete value['notes'];
          if (fields !== undefined) {
            const selected = new Set(fields);
            if (!selected.has('conditions')) delete value['conditionIds'];
            if (!selected.has('observations')) delete value['observationIds'];
            if (!selected.has('orders')) delete value['orderIds'];
          }
          return parseProjection(value);
        }
      }
      return null;
    });
  }

  private withActor<T>(
    actor: Feature010EncounterActor,
    action: 'createEncounter',
    role: 'CLN',
    work: (sql: TransactionSql) => Promise<T>,
  ): Promise<T> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.setActor(sql, actor, action, role);
      await sql`
        select set_config('statement_timeout','5000',true),
          set_config('lock_timeout','2000',true)
      `;
      return work(sql);
    });
  }

  private setActor(
    sql: TransactionSql,
    actor: Feature010EncounterActor,
    action: 'createEncounter' | 'getEncounter',
    role: 'CLN' | 'PAT' | 'GUA' | 'DEL',
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
