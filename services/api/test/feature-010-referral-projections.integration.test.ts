import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';

import type { Feature010Uuid, ReferralProjection } from '@shifaa/contracts';

import { PostgresFeature010ReferralRepository } from '../src/adapters/postgres/feature-010-referrals.js';
import type { PostgresIdentityRepository } from '../src/adapters/postgres/identity-repository.js';
import { Feature010ReferralService } from '../src/modules/feature-010/referrals.js';
import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';
import { registerFeature010ReferralRoutes } from '../src/routes/feature-010-referrals.js';

type ReferralRole = 'PAT' | 'GUA' | 'DEL' | 'CLN';
interface ReferralRow {
  readonly referral_id: string;
  readonly created_at: string;
  readonly projection: unknown;
}
interface ListCall {
  readonly role: ReferralRole;
  readonly values: readonly unknown[];
}

const actorId = 'f0100000-0000-4000-8000-000000000001' as Feature010Uuid;
const patientId = 'f0100000-0000-4000-8000-000000000003' as Feature010Uuid;
const facilityId = 'f0100000-0000-4000-8200-000000000001' as Feature010Uuid;
const encounterId = 'f0100000-0000-4000-8800-000000000001' as Feature010Uuid;
const firstId = 'f0100000-0000-4000-8a00-000000000003' as Feature010Uuid;
const secondId = 'f0100000-0000-4000-8a00-000000000002' as Feature010Uuid;
const thirdId = 'f0100000-0000-4000-8a00-000000000005' as Feature010Uuid;
const lastUpdatedAt = '2030-04-05T08:00:00.000Z';
const roles: readonly ReferralRole[] = ['PAT', 'GUA', 'DEL', 'CLN'];

const pendingSource: ReferralProjection = {
  id: firstId,
  sourceEncounterId: encounterId,
  status: 'pending',
  version: 1,
  targetSpecialty: 'cardiology',
  reasonSummary: 'Source clinician summary.',
};
const acceptedSource: ReferralProjection = {
  id: secondId,
  sourceEncounterId: encounterId,
  status: 'accepted',
  version: 2,
  targetSpecialty: 'cardiology',
  reasonSummary: 'Source clinician summary.',
  acceptedFieldCodes: ['reason_summary'],
  resultingAppointmentId: 'f0100000-0000-4000-8500-000000000002',
};
const acceptedTarget: ReferralProjection = {
  id: thirdId,
  status: 'accepted',
  version: 2,
  acceptedFieldCodes: ['reason_summary', 'encounter_type'],
  resultingAppointmentId: 'f0100000-0000-4000-8500-000000000003',
  reasonSummary: 'Reason released by the patient.',
  encounterType: 'consultation',
};

function row(projection: ReferralProjection, createdAt: string): ReferralRow {
  return { referral_id: projection.id, created_at: createdAt, projection };
}

const firstRow = row(pendingSource, '2030-04-05T10:00:00.000000Z');
const secondRow = row(acceptedSource, '2030-04-05T10:00:00.000000Z');
const thirdRow = row(acceptedTarget, '2030-04-05T09:00:00.000000Z');

function compareRows(left: ReferralRow, right: ReferralRow): number {
  return left.created_at === right.created_at
    ? right.referral_id.localeCompare(left.referral_id)
    : right.created_at.localeCompare(left.created_at);
}

function sqlFor(
  data: Partial<Record<ReferralRole, readonly ReferralRow[]>>,
  calls: ListCall[],
): TransactionSql {
  let activeRole: ReferralRole = 'PAT';
  const query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const statement = strings.join(' ');
    if (statement.includes("set_config('shifaa.person_id'")) {
      activeRole = values[5] as ReferralRole;
      return [];
    }
    if (statement.includes("set_config('shifaa.actor_role'")) {
      activeRole = values[0] as ReferralRole;
      return [];
    }
    if (!statement.includes('clinical.list_referrals_api_v1')) return [];

    calls.push({ role: activeRole, values });
    const afterCreatedAt = values[0];
    const afterId = values[1];
    const limit = Number(values[2]);
    return [...(data[activeRole] ?? [])]
      .filter((item) => {
        if (typeof afterCreatedAt !== 'string' || typeof afterId !== 'string') return true;
        return (
          item.created_at < afterCreatedAt ||
          (item.created_at === afterCreatedAt && item.referral_id < afterId)
        );
      })
      .sort(compareRows)
      .slice(0, limit);
  };
  return Object.assign(query, { json: (value: unknown) => value }) as unknown as TransactionSql;
}

function serviceFor(
  data: Partial<Record<ReferralRole, readonly ReferralRow[]>>,
  calls: ListCall[],
): Feature010ReferralService {
  const sql = sqlFor(data, calls);
  const transactionRepository: Pick<PostgresIdentityRepository, 'withRawTransaction'> = {
    withRawTransaction: async <T>(work: (transaction: TransactionSql) => Promise<T>) => work(sql),
  };
  const repository = new PostgresFeature010ReferralRepository(
    transactionRepository,
    'local',
    'feature-010-referral-projection-test-secret',
  );
  return new Feature010ReferralService(repository);
}

const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function appFor(service: Feature010ReferralService) {
  const app = Fastify({ logger: false });
  apps.push(app);
  await registerFeature010ReferralRoutes(app, { service, syntheticMode: true });
  installIdentityErrorHandler(app);
  return app;
}

function headers() {
  return {
    authorization: `Bearer synthetic-person:${actorId}`,
    'x-aal': '2',
    'x-purpose': 'appointment.scheduling',
    'accept-language': 'en-EG',
  };
}

describe('Feature 010 listReferrals projection and pagination integration', () => {
  it('uses the default and maximum limits and forwards only closed filters to SQL', async () => {
    const calls: ListCall[] = [];
    const service = serviceFor({ PAT: [firstRow] }, calls);
    const app = await appFor(service);

    const defaultPage = await app.inject({
      method: 'GET',
      url: '/v1/referrals',
      headers: headers(),
    });
    expect(defaultPage.statusCode).toBe(200);
    expect(calls).toHaveLength(4);
    expect(calls.map((call) => call.role)).toEqual(roles);
    expect(calls.map((call) => call.values[2])).toEqual([26, 26, 26, 26]);
    expect(calls.every((call) => call.values.slice(3).every((value) => value === null))).toBe(true);

    calls.splice(0);
    const maximumPage = await app.inject({
      method: 'GET',
      url: `/v1/referrals?limit=100&patientId=${patientId}&facilityId=${facilityId}&specialty=%20cardiology%20&status=accepted&date=2030-04-05`,
      headers: headers(),
    });
    expect(maximumPage.statusCode).toBe(200);
    expect(calls).toHaveLength(4);
    expect(calls.map((call) => call.values[2])).toEqual([101, 101, 101, 101]);
    expect(calls.map((call) => call.values.slice(3))).toEqual(
      Array.from({ length: 4 }, () => [
        patientId,
        facilityId,
        'cardiology',
        'accepted',
        '2030-04-05',
      ]),
    );

    calls.splice(0);
    const widened = await app.inject({
      method: 'GET',
      url: '/v1/referrals?limit=101&includePrivate=true',
      headers: headers(),
    });
    expect(widened.statusCode).toBe(422);
    expect(calls).toHaveLength(0);
  });

  it('merges role results with a deterministic descending cursor and rechecks every role on each page', async () => {
    const calls: ListCall[] = [];
    const sharedFirstRow = [firstRow];
    const service = serviceFor(
      {
        PAT: [firstRow, secondRow],
        GUA: sharedFirstRow,
        DEL: [secondRow],
        CLN: [firstRow, thirdRow],
      },
      calls,
    );
    const app = await appFor(service);
    const firstPage = await app.inject({
      method: 'GET',
      url: '/v1/referrals?limit=2&specialty=cardiology',
      headers: headers(),
    });
    expect(firstPage.statusCode).toBe(200);
    const firstBody = firstPage.json();
    expect(firstBody.data.map((referral: ReferralProjection) => referral.id)).toEqual([
      firstId,
      secondId,
    ]);
    expect(firstBody.meta.nextCursor).toEqual(expect.any(String));
    expect(calls).toHaveLength(4);
    expect(calls.map((call) => call.values.slice(0, 2))).toEqual(
      Array.from({ length: 4 }, () => [null, null]),
    );

    const repeatedFirstPage = await app.inject({
      method: 'GET',
      url: '/v1/referrals?limit=2&specialty=cardiology',
      headers: headers(),
    });
    expect(repeatedFirstPage.statusCode).toBe(200);
    expect(repeatedFirstPage.json().meta.nextCursor).toBe(firstBody.meta.nextCursor);
    expect(calls).toHaveLength(8);

    const nextCursor = firstBody.meta.nextCursor as string;
    const secondPage = await app.inject({
      method: 'GET',
      url: `/v1/referrals?limit=2&specialty=cardiology&cursor=${encodeURIComponent(nextCursor)}`,
      headers: headers(),
    });
    expect(secondPage.statusCode).toBe(200);
    expect(secondPage.json().data.map((referral: ReferralProjection) => referral.id)).toEqual([
      thirdId,
    ]);
    expect(secondPage.json().meta.nextCursor).toBeNull();
    expect(calls).toHaveLength(12);
    expect(calls.slice(8).map((call) => call.role)).toEqual(roles);
    expect(calls.slice(8).map((call) => call.values.slice(0, 2))).toEqual(
      Array.from({ length: 4 }, () => [secondRow.created_at, secondId]),
    );
    expect(calls.slice(8).map((call) => call.values.slice(3))).toEqual(
      Array.from({ length: 4 }, () => [null, null, 'cardiology', null, null]),
    );
  });

  it('binds a cursor to the same actor and filters so a later query cannot widen scope', async () => {
    const calls: ListCall[] = [];
    const service = serviceFor({ PAT: [firstRow, secondRow] }, calls);
    const app = await appFor(service);
    const firstPage = await app.inject({
      method: 'GET',
      url: '/v1/referrals?limit=1&specialty=cardiology',
      headers: headers(),
    });
    const cursor = firstPage.json().meta.nextCursor as string;
    expect(cursor).toEqual(expect.any(String));
    expect(calls).toHaveLength(4);

    const changedFilter = await app.inject({
      method: 'GET',
      url: `/v1/referrals?limit=1&specialty=neurology&cursor=${encodeURIComponent(cursor)}`,
      headers: headers(),
    });
    expect(changedFilter.statusCode).toBe(422);
    expect(calls).toHaveLength(4);

    const changedActor = await app.inject({
      method: 'GET',
      url: `/v1/referrals?limit=1&specialty=cardiology&cursor=${encodeURIComponent(cursor)}`,
      headers: { ...headers(), authorization: `Bearer synthetic-person:${patientId}` },
    });
    expect(changedActor.statusCode).toBe(422);
    expect(calls).toHaveLength(4);
  });

  it('keeps accepted target rows inside the closed reason-and-optional-type envelope', async () => {
    const calls: ListCall[] = [];
    const service = serviceFor({ CLN: [thirdRow] }, calls);
    const app = await appFor(service);
    const result = await app.inject({ method: 'GET', url: '/v1/referrals', headers: headers() });

    expect(result.statusCode).toBe(200);
    expect(result.json().data).toEqual([acceptedTarget]);
    expect(Object.keys(result.json().data[0] as object).sort()).toEqual([
      'acceptedFieldCodes',
      'encounterType',
      'id',
      'reasonSummary',
      'resultingAppointmentId',
      'status',
      'version',
    ]);

    const leakedProjection = {
      ...acceptedTarget,
      privateNote: 'must never be disclosed',
    };
    const rejectedCalls: ListCall[] = [];
    const rejectedService = serviceFor(
      { CLN: [row(leakedProjection as ReferralProjection, thirdRow.created_at)] },
      rejectedCalls,
    );
    const rejectedApp = await appFor(rejectedService);
    const rejected = await rejectedApp.inject({
      method: 'GET',
      url: '/v1/referrals',
      headers: headers(),
    });
    expect(rejected.statusCode).toBe(500);
    expect(rejected.body).not.toContain('must never be disclosed');
  });
});
