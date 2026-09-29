import type { TransactionSql } from 'postgres';
import { describe, expect, it } from 'vitest';

import type { EncounterCompleteResult, Feature010Uuid } from '@shifaa/contracts';

import { PostgresFeature010EncounterRepository } from '../src/adapters/postgres/feature-010-encounters.js';
import type { Feature010EncounterUpdateContext } from '../src/modules/feature-010/encounters.js';
import type { PostgresIdentityRepository } from '../src/adapters/postgres/identity-repository.js';

const actor = {
  personId: 'f0100000-0000-4000-8000-000000000001' as Feature010Uuid,
  principal: 'synthetic-person:f0100000-0000-4000-8000-000000000001',
  requestId: 'f0100000-0000-4000-9000-000000000001',
  traceId: 'f0100000-0000-4000-9000-000000000001',
  aal: 2 as const,
  locale: 'en-EG' as const,
  purposes: ['appointment.scheduling'],
};
const encounterId = 'f0100000-0000-4000-8800-000000000001' as Feature010Uuid;
const request = {
  summary: 'Completion through the locked SQL boundary.',
  structuralConfirmation: true as const,
};
const response: EncounterCompleteResult = {
  encounter: {
    id: encounterId,
    patientId: 'f0100000-0000-4000-8000-000000000002',
    facilityId: 'f0100000-0000-4000-8200-000000000001',
    appointmentId: 'f0100000-0000-4000-8500-000000000001',
    encounterType: 'consultation',
    responsibleClinicianId: actor.personId,
    status: 'completed',
    startedAt: '2030-04-05T07:00:00.000Z',
    endedAt: '2030-04-05T07:30:00.000Z',
    completionSummary: request.summary,
    version: 2,
    conditionIds: [],
    observationIds: [],
    orderIds: [],
  },
  appointmentId: 'f0100000-0000-4000-8500-000000000001',
  appointmentVersion: 4,
  appointmentStatus: 'completed',
  queueStatus: 'completed',
  queueEntryId: 'f0100000-0000-4000-8700-000000000001',
  queueVersion: 3,
  completedAt: '2030-04-05T07:30:00.000Z',
};

function transactionRepository(
  fakeSql: TransactionSql,
): Pick<PostgresIdentityRepository, 'withRawTransaction'> {
  return {
    withRawTransaction: async <T>(work: (sql: TransactionSql) => Promise<T>) => work(fakeSql),
  };
}

function completionSql(captured: Array<{ statement: string; values: unknown[] }>): TransactionSql {
  const query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const statement = strings.join(' ');
    captured.push({ statement, values });
    if (statement.includes('complete_encounter_api_v1')) return [{ response }];
    return [];
  };
  return Object.assign(query, { json: (value: unknown) => value }) as unknown as TransactionSql;
}

describe('Feature 010 completion Postgres adapter', () => {
  it('sets current actor and idempotency context, then calls the C13 wrapper with If-Match', async () => {
    const captured: Array<{ statement: string; values: unknown[] }> = [];
    const repository = new PostgresFeature010EncounterRepository(
      transactionRepository(completionSql(captured)),
      'local',
      {} as never,
    );
    const context: Feature010EncounterUpdateContext = {
      actor,
      idempotencyKey: 'f010-c13-adapter-key-001',
      requestHash: 'a'.repeat(64),
      expectedVersion: 1,
    };

    await expect(repository.completeEncounter(context, encounterId, request)).resolves.toEqual(
      response,
    );

    expect(captured[0]?.values).toContain('completeEncounter');
    expect(captured[0]?.values).toContain(actor.personId);
    expect(captured[2]?.values).toEqual([context.idempotencyKey, context.requestHash]);
    expect(captured[3]?.statement).toContain('clinical.complete_encounter_api_v1');
    expect(captured[3]?.values).toEqual([encounterId, context.expectedVersion, request]);
  });

  it('rejects a malformed canonical SQL response', async () => {
    const query = async (strings: TemplateStringsArray) => {
      if (strings.join(' ').includes('complete_encounter_api_v1')) {
        return [{ response: { encounter: {} } }];
      }
      return [];
    };
    const sql = Object.assign(query, {
      json: (value: unknown) => value,
    }) as unknown as TransactionSql;
    const repository = new PostgresFeature010EncounterRepository(
      transactionRepository(sql),
      'local',
      {} as never,
    );

    await expect(
      repository.completeEncounter(
        {
          actor,
          idempotencyKey: 'f010-c13-adapter-key-002',
          requestHash: 'b'.repeat(64),
          expectedVersion: 1,
        },
        encounterId,
        request,
      ),
    ).rejects.toThrow('invalid canonical response');
  });
});
