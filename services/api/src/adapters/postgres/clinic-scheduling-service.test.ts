import { describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';

import {
  parseClinicSchedulingMutationResponse,
  PostgresClinicSchedulingService,
} from './clinic-scheduling-service.js';

const actor = {
  personId: 'f0090000-0000-4000-8000-000000000001',
  principal: 'synthetic-principal',
  requestId: 'f0090000-0000-4000-8000-000000000010',
  traceId: 'f0090000-0000-4000-8000-000000000011',
  aal: 1 as const,
  locale: 'en-EG' as const,
};
const filter = {
  facilityId: 'f0090000-0000-4000-8000-000000000100',
  doctorId: 'f0090000-0000-4000-8000-000000000002',
  date: '2030-01-01',
} as const;

function fakeRepository(response: unknown) {
  const calls: unknown[][] = [];
  let transactionCount = 0;
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(values);
    if (calls.length === 1) return Promise.resolve([]);
    return Promise.resolve(Array.isArray(response) ? response : [{ response }]);
  }) as unknown as TransactionSql;
  return {
    calls,
    get transactionCount() {
      return transactionCount;
    },
    repository: {
      withRawTransaction: async <T>(work: (sql: TransactionSql) => Promise<T>): Promise<T> => {
        transactionCount += 1;
        return work(sql);
      },
    },
  };
}

describe('Feature 009 PostgreSQL adapter boundary', () => {
  it('is exposed as a repository/service adapter', () => {
    expect(PostgresClinicSchedulingService).toBeTypeOf('function');
  });

  it('declares database-function atomicity instead of exposing an unbound transaction callback', () => {
    expect('executeFunctionAtomically' in PostgresClinicSchedulingService.prototype).toBe(false);
    expect(PostgresClinicSchedulingService.prototype).not.toHaveProperty('withTransaction');
  });

  it('fails closed when a database function does not return the approved DTO', () => {
    expect(() =>
      parseClinicSchedulingMutationResponse('createAppointment', { id: 'only-id' }),
    ).toThrow('invalid response DTO');
  });

  it('accepts a JSON-encoded approved DTO without fabricating fields', () => {
    const appointment = {
      id: 'f0090000-0000-4000-8300-000000000001',
      patientId: 'f0090000-0000-4000-8000-000000000003',
      facilityId: 'f0090000-0000-4000-8100-000000000001',
      doctorId: 'f0090000-0000-4000-8000-000000000002',
      startsAt: '2030-01-07T07:00:00.000Z',
      endsAt: '2030-01-07T07:30:00.000Z',
      timezone: 'Africa/Cairo',
      civilDate: '2030-01-07',
      status: 'confirmed',
      feeMinorUnits: 10000,
      currency: 'EGP',
      paymentMethod: 'cash_on_arrival',
      version: 1,
    } as const;
    expect(
      parseClinicSchedulingMutationResponse('createAppointment', JSON.stringify(appointment)),
    ).toEqual(appointment);
  });

  it('rejects malformed discovery and queue cursors before issuing a database read', async () => {
    const fake = fakeRepository(null);
    const adapter = new PostgresClinicSchedulingService(fake.repository);

    await expect(
      Promise.resolve().then(() =>
        adapter.searchDoctors(null, { near: '30,31' }, { cursor: 'not-a-cursor', limit: 1 }),
      ),
    ).rejects.toThrow('Invalid discovery cursor');
    await expect(
      Promise.resolve().then(() =>
        adapter.getQueue(actor, filter, { cursor: 'not-a-cursor', limit: 1 }),
      ),
    ).rejects.toThrow('Invalid queue cursor');
    expect(fake.transactionCount).toBe(0);
  });

  it('binds the complete discovery key and queue tuple when following cursors', async () => {
    const doctorRows = [
      {
        doctor_id: filter.doctorId,
        doctor_display_name: 'Synthetic Doctor',
        specialty: 'dentistry',
        professional_license_verified: true,
        facility_id: filter.facilityId,
        facility_display_name: 'Synthetic Clinic',
        facility_verified: true,
        fee_minor_units: 100,
        currency_code: 'EGP',
        payment_method: 'cash_on_arrival',
        next_starts_at: null,
        next_ends_at: null,
        next_timezone: null,
        next_civil_date: null,
        next_local_start: null,
        distance_m: 10,
        availability_version: 1,
        updated_at: '2030-01-01T00:00:00.000Z',
        stale: false,
      },
      {
        doctor_id: 'f0090000-0000-4000-8000-000000000003',
        doctor_display_name: 'Synthetic Doctor Two',
        specialty: 'dentistry',
        professional_license_verified: true,
        facility_id: filter.facilityId,
        facility_display_name: 'Synthetic Clinic',
        facility_verified: true,
        fee_minor_units: 100,
        currency_code: 'EGP',
        payment_method: 'cash_on_arrival',
        next_starts_at: null,
        next_ends_at: null,
        next_timezone: null,
        next_civil_date: null,
        next_local_start: null,
        distance_m: 20,
        availability_version: 1,
        updated_at: '2030-01-01T00:00:00.000Z',
        stale: false,
      },
    ];
    const fake = fakeRepository(doctorRows);
    const adapter = new PostgresClinicSchedulingService(fake.repository);
    const first = await adapter.searchDoctors(null, { near: '30,31' }, { limit: 1 });
    expect(first.nextCursor).toEqual(expect.any(String));
    await adapter.searchDoctors(null, { near: '30,31' }, { cursor: first.nextCursor!, limit: 1 });
    const searchCall = fake.calls.at(-1)!;
    expect(searchCall.slice(6, 9)).toEqual([10, filter.doctorId, filter.facilityId]);

    const queue = {
      facilityId: filter.facilityId,
      doctorId: filter.doctorId,
      civilDate: filter.date,
      version: 3,
      entries: [
        {
          id: 'f0090000-0000-4000-8000-000000000004',
          appointmentId: 'f0090000-0000-4000-8000-000000000005',
          facilityId: filter.facilityId,
          doctorId: filter.doctorId,
          civilDate: filter.date,
          queueNumber: 1,
          position: 1,
          state: 'waiting',
          version: 1,
        },
        {
          id: 'f0090000-0000-4000-8000-000000000006',
          appointmentId: 'f0090000-0000-4000-8000-000000000007',
          facilityId: filter.facilityId,
          doctorId: filter.doctorId,
          civilDate: filter.date,
          queueNumber: 2,
          state: 'called',
          version: 1,
        },
      ],
      nextCursor: null,
    };
    const queueFake = fakeRepository(queue);
    const queueAdapter = new PostgresClinicSchedulingService(queueFake.repository);
    const firstQueue = await queueAdapter.getQueue(actor, filter, { limit: 1 });
    expect(firstQueue.nextCursor).toEqual(expect.any(String));
    await queueAdapter.getQueue(actor, filter, { cursor: firstQueue.nextCursor!, limit: 1 });
    const queueCall = queueFake.calls.at(-1)!;
    expect(queueCall.slice(3, 9)).toEqual([0, 1, 1, queue.entries[0]!.id, 3, 2]);
  });
});
