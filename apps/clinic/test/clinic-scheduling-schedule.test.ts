import assert from 'node:assert/strict';
import test from 'node:test';
import { createClinicSchedulingClient } from '@shifaa/api-client/clinic-scheduling';

const facilityId = '90000000-0000-4000-8000-000000000001';
const doctorId = '91000000-0000-4000-8000-000000000001';
const scheduleId = '92000000-0000-4000-8000-000000000001';

test('schedule UI mutations preserve generated API authority, versions, and response truth', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const client = createClinicSchedulingClient({
    baseUrl: 'https://synthetic.invalid',
    accessToken: 'synthetic-test-token',
    acceptLanguage: 'en-EG',
    fetch: async (input, init = {}) => {
      requests.push({ url: String(input), init });
      const url = String(input);
      if (url.endsWith('/schedules'))
        return Response.json({
          id: scheduleId,
          facilityId,
          doctorId,
          timezone: 'Africa/Cairo',
          validFrom: '2030-01-01',
          validTo: '2030-12-31',
          slotDurationMinutes: 30,
          feeMinorUnits: 0,
          currency: 'EGP',
          status: 'active',
          windows: [{ isoWeekday: 1, localStart: '09:00', localEnd: '10:00' }],
          version: 1,
        });
      if (url.endsWith('/absence'))
        return Response.json({
          absenceId: '93000000-0000-4000-8000-000000000001',
          affectedAppointmentIds: ['94000000-0000-4000-8000-000000000001'],
          removedQueueEntryIds: ['95000000-0000-4000-8000-000000000001'],
          replacementSuggestions: [],
        });
      return Response.json({
        delayId: '96000000-0000-4000-8000-000000000001',
        facilityId,
        doctorId,
        civilDate: '2030-01-07',
        delayMinutes: 15,
        version: 2,
      });
    },
  });

  const created = await client.createSchedule(
    facilityId,
    {
      doctorId,
      timezone: 'Africa/Cairo',
      validFrom: '2030-01-01',
      validTo: '2030-12-31',
      slotDurationMinutes: 30,
      feeMinorUnits: 0,
      status: 'active',
      windows: [{ isoWeekday: 1, localStart: '09:00', localEnd: '10:00' }],
    },
    'synthetic-create-key',
  );
  const delay = await client.sendDoctorDelay(
    facilityId,
    doctorId,
    {
      civilDate: '2030-01-07',
      delayMinutes: 15,
      templateCode: 'approved-candidate',
      reason: 'traffic',
    },
    'synthetic-delay-key',
  );
  const absence = await client.declareDoctorAbsence(
    facilityId,
    doctorId,
    {
      startsAt: '2030-01-07T09:00:00+02:00',
      endsAt: '2030-01-07T12:00:00+02:00',
      civilDate: '2030-01-07',
      reason: 'staffing',
    },
    'synthetic-absence-key',
  );

  assert.equal(created.currency, 'EGP');
  assert.equal(created.feeMinorUnits, 0);
  assert.equal(delay.delayId, '96000000-0000-4000-8000-000000000001');
  assert.deepEqual(absence.affectedAppointmentIds, ['94000000-0000-4000-8000-000000000001']);
  assert.deepEqual(absence.removedQueueEntryIds, ['95000000-0000-4000-8000-000000000001']);
  assert.deepEqual(
    requests.map(({ url }) => new URL(url).pathname),
    [
      `/v1/clinics/${facilityId}/schedules`,
      `/v1/clinics/${facilityId}/doctors/${doctorId}/delay`,
      `/v1/clinics/${facilityId}/doctors/${doctorId}/absence`,
    ],
  );
  const createHeaders = new Headers(requests[0]?.init.headers);
  const delayHeaders = new Headers(requests[1]?.init.headers);
  assert.equal(createHeaders.get('Idempotency-Key'), 'synthetic-create-key');
  assert.equal(delayHeaders.get('Idempotency-Key'), 'synthetic-delay-key');
  assert.equal(createHeaders.get('Accept-Language'), 'en-EG');
  assert.equal(requests[2]?.init.cache, 'no-store');
});
