import { describe, expect, it } from 'vitest';

import type {
  ClinicSchedulingActor,
  ClinicSchedulingPublicActor,
  ClinicSchedulingRequestContext,
  CreateAppointmentCommand,
  CreateScheduleCommand,
} from './types.js';

describe('Feature 009 API DTO trust boundaries', () => {
  it('keeps server pricing facts out while retaining required appointment contract fields', () => {
    const schedule: CreateScheduleCommand = {
      doctorId: 'f0090000-0000-4000-8000-000000000002',
      timezone: 'Africa/Cairo',
      validFrom: '2030-01-01',
      validTo: '2030-01-31',
      slotDurationMinutes: 30,
      feeMinorUnits: 10000,
      status: 'active',
      windows: [{ isoWeekday: 1, localStart: '09:00', localEnd: '10:00' }],
    };
    const appointment: CreateAppointmentCommand = {
      patientId: 'f0090000-0000-4000-8000-000000000003',
      facilityId: 'f0090000-0000-4000-8000-000000000001',
      doctorId: schedule.doctorId,
      startsAt: '2030-01-07T07:00:00.000Z',
      endsAt: '2030-01-07T07:30:00.000Z',
      timezone: 'Africa/Cairo',
      civilDate: '2030-01-07',
      paymentMethod: 'cash_on_arrival',
    };
    expect(appointment).not.toHaveProperty('feeMinorUnits');
    expect(schedule).not.toHaveProperty('facilityId');
    expect(schedule).not.toHaveProperty('role');
    expect(schedule).not.toHaveProperty('license');
  });

  it('represents actor identity without client-supplied role, purpose, or relationship authority', () => {
    const actor: ClinicSchedulingActor = {
      personId: 'f0090000-0000-4000-8000-000000000001',
      principal: 'synthetic-principal',
      requestId: 'f0090000-0000-4000-8000-000000000010',
      traceId: 'f0090000-0000-4000-8000-000000000011',
      aal: 1,
      locale: 'en-EG',
    };
    expect(actor).not.toHaveProperty('role');
    expect(actor).not.toHaveProperty('purpose');
    expect(actor).not.toHaveProperty('facilityId');
    expect(actor).not.toHaveProperty('relationship');
  });

  it('represents anonymous discovery reads without an authenticated actor', () => {
    const actor: ClinicSchedulingPublicActor = null;
    expect(actor).toBeNull();
  });

  it('keeps idempotency metadata on request context, outside the authenticated actor', () => {
    const request: ClinicSchedulingRequestContext = {
      actor: {
        personId: 'f0090000-0000-4000-8000-000000000001',
        principal: 'synthetic-principal',
        requestId: 'f0090000-0000-4000-8000-000000000010',
        traceId: 'f0090000-0000-4000-8000-000000000011',
        aal: 1,
        locale: 'en-EG',
      },
      idempotencyKey: 'request-key',
      requestHash: 'a'.repeat(64),
    };
    expect(request.actor).not.toHaveProperty('idempotencyKey');
    expect(request.actor).not.toHaveProperty('requestHash');
    expect(request).not.toHaveProperty('facilityId');
    expect(request).not.toHaveProperty('role');
    expect(request).not.toHaveProperty('purpose');
  });
});
