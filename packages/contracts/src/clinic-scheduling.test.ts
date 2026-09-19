import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';

import { clinicSchedulingOperations, clinicSchedulingSchemas } from './clinic-scheduling.js';

const operationIds = [
  'searchDoctors',
  'listDoctorAvailability',
  'createSchedule',
  'updateSchedule',
  'createScheduleException',
  'listAppointments',
  'createAppointment',
  'getAppointment',
  'cancelAppointment',
  'rescheduleAppointment',
  'checkInAppointment',
  'getQueue',
  'getMyQueuePosition',
  'callQueueEntry',
  'reorderQueueEntry',
  'completeQueueEntry',
  'sendDoctorDelay',
  'declareDoctorAbsence',
] as const;

describe('generated Feature 009 contracts', () => {
  it('exposes exactly the approved 18 operation identifiers and routes', () => {
    expect(clinicSchedulingOperations).toHaveLength(18);
    expect(clinicSchedulingOperations.map(({ operationId }) => operationId)).toEqual(operationIds);
    expect(new Set(clinicSchedulingOperations.map(({ operationId }) => operationId)).size).toBe(18);
  });

  it('preserves closed minimum projection, cursors, versions, and cash-only fields', () => {
    expect(clinicSchedulingSchemas.PublicDoctorProjection.additionalProperties).toBe(false);
    expect(clinicSchedulingSchemas.PublicDoctorProjection.required).toEqual([
      'doctorId',
      'doctorDisplayName',
      'specialty',
      'professionalLicenseVerified',
      'facilityId',
      'facilityDisplayName',
      'facilityVerified',
      'feeMinorUnits',
      'currency',
      'paymentMethod',
      'nextAvailableSlot',
      'distanceMeters',
      'availabilityVersion',
      'updatedAt',
      'stale',
    ]);
    expect(clinicSchedulingSchemas.PublicDoctorProjection.properties.paymentMethod.const).toBe(
      'cash_on_arrival',
    );
    expect(clinicSchedulingSchemas.AvailabilityPage.required).toEqual([
      'items',
      'feeMinorUnits',
      'currency',
      'paymentMethod',
      'version',
      'freshness',
    ]);
    expect(clinicSchedulingSchemas.DoctorSearchPage.required).toContain('freshness');
    expect(clinicSchedulingSchemas.AppointmentPage.required).toContain('freshness');
    expect(
      Value.Check(clinicSchedulingSchemas.AppointmentPage, {
        items: [],
        freshness: 'stale',
      }),
    ).toBe(true);
    expect(
      Value.Check(clinicSchedulingSchemas.AppointmentPage, {
        items: [],
      }),
    ).toBe(false);
    for (const freshness of ['fresh', 'stale', 'unknown'])
      expect(Value.Check(clinicSchedulingSchemas.ReadFreshness, freshness)).toBe(true);
    expect(Value.Check(clinicSchedulingSchemas.ReadFreshness, 'confirmed')).toBe(false);
    expect(clinicSchedulingSchemas.Queue.properties).toHaveProperty('freshness');
    expect(clinicSchedulingSchemas.CurrencyCode.const).toBe('EGP');
    const completeSchedule = {
      id: '91000000-0000-4000-8000-000000000010',
      facilityId: '91000000-0000-4000-8000-000000000001',
      doctorId: '91000000-0000-4000-8000-000000000002',
      timezone: 'Africa/Cairo',
      validFrom: '2026-04-15',
      validTo: '2026-04-30',
      slotDurationMinutes: 30,
      feeMinorUnits: 12500,
      currency: 'EGP',
      status: 'active',
      windows: [{ isoWeekday: 3, localStart: '08:00', localEnd: '09:00' }],
      version: 1,
    };
    expect(Value.Check(clinicSchedulingSchemas.Schedule, completeSchedule)).toBe(true);
    expect(
      Value.Check(clinicSchedulingSchemas.Schedule, {
        ...completeSchedule,
        feeMinorUnits: undefined,
      }),
    ).toBe(false);
    expect(clinicSchedulingSchemas.Queue.required).toContain('nextCursor');
    expect(clinicSchedulingSchemas.QueuePosition.required).toEqual([
      'appointmentId',
      'state',
      'queueNumber',
      'queueVersion',
      'updatedAt',
      'stale',
    ]);
    expect(clinicSchedulingSchemas.Problem.required).toEqual(['type', 'title', 'status']);
  });

  it('rejects ordinary delay or reassignment bypass payloads while dedicated requests remain valid', () => {
    expect(
      Value.Check(clinicSchedulingSchemas.CreateScheduleExceptionRequest, {
        type: 'delay',
        startsAt: '2026-04-15T08:00:00Z',
        endsAt: '2026-04-15T08:30:00Z',
        civilDate: '2026-04-15',
        reason: 'synthetic',
      }),
    ).toBe(false);
    expect(
      Value.Check(clinicSchedulingSchemas.CreateScheduleExceptionRequest, {
        type: 'absence',
        startsAt: '2026-04-15T08:00:00Z',
        endsAt: '2026-04-15T08:30:00Z',
        civilDate: '2026-04-15',
        reason: 'synthetic',
      }),
    ).toBe(false);
    expect(
      Value.Check(clinicSchedulingSchemas.CreateScheduleExceptionRequest, {
        type: 'blocked',
        startsAt: '2026-04-15T08:00:00Z',
        endsAt: '2026-04-15T08:30:00Z',
        civilDate: '2026-04-15',
        reason: 'synthetic',
        delayMinutes: 30,
      }),
    ).toBe(false);
    expect(
      Value.Check(clinicSchedulingSchemas.UpdateScheduleRequest, {
        doctorId: '91000000-0000-4000-8000-000000000001',
        status: 'active',
      }),
    ).toBe(false);
    expect(
      Value.Check(clinicSchedulingSchemas.UpdateScheduleRequest, {
        feeMinorUnits: 12500,
      }),
    ).toBe(true);
    expect(
      Value.Check(clinicSchedulingSchemas.UpdateScheduleRequest, {
        doctorId: '91000000-0000-4000-8000-000000000001',
        feeMinorUnits: 12500,
      }),
    ).toBe(false);
    expect(
      Value.Check(clinicSchedulingSchemas.UpdateScheduleRequest, {
        currency: 'EGP',
      }),
    ).toBe(false);
    expect(
      Value.Check(clinicSchedulingSchemas.CreateScheduleRequest, {
        doctorId: '91000000-0000-4000-8000-000000000001',
        timezone: 'Africa/Cairo',
        validFrom: '2026-04-15',
        validTo: '2026-04-30',
        slotDurationMinutes: 30,
        status: 'active',
        windows: [{ isoWeekday: 3, localStart: '08:00', localEnd: '09:00' }],
      }),
    ).toBe(false);
    expect(
      Value.Check(clinicSchedulingSchemas.CreateScheduleRequest, {
        doctorId: '91000000-0000-4000-8000-000000000001',
        timezone: 'Africa/Cairo',
        validFrom: '2026-04-15',
        validTo: '2026-04-30',
        slotDurationMinutes: 30,
        feeMinorUnits: 12500,
        status: 'active',
        windows: [{ isoWeekday: 3, localStart: '08:00', localEnd: '09:00' }],
      }),
    ).toBe(true);
    expect(
      Value.Check(clinicSchedulingSchemas.CreateAppointmentRequest, {
        patientId: '91000000-0000-4000-8000-000000000003',
        facilityId: '91000000-0000-4000-8000-000000000001',
        doctorId: '91000000-0000-4000-8000-000000000002',
        startsAt: '2026-04-15T08:00:00Z',
        endsAt: '2026-04-15T08:30:00Z',
        timezone: 'Africa/Cairo',
        civilDate: '2026-04-15',
        paymentMethod: 'cash_on_arrival',
        feeMinorUnits: 12500,
      }),
    ).toBe(false);
    expect(
      Value.Check(clinicSchedulingSchemas.DelayRequest, {
        civilDate: '2026-04-15',
        delayMinutes: 30,
        templateCode: 'synthetic-delay',
        reason: 'synthetic',
      }),
    ).toBe(true);
    expect(
      Value.Check(clinicSchedulingSchemas.AbsenceRequest, {
        startsAt: '2026-04-15T08:00:00Z',
        endsAt: '2026-04-15T08:30:00Z',
        civilDate: '2026-04-15',
        reason: 'synthetic',
      }),
    ).toBe(true);
  });

  it('preserves OpenAPI query constraints in generated schemas', () => {
    expect(
      Value.Check(clinicSchedulingSchemas.SearchDoctorsQuery, {
        radius: 99,
      }),
    ).toBe(false);
    expect(
      Value.Check(clinicSchedulingSchemas.SearchDoctorsQuery, {
        radius: 100,
      }),
    ).toBe(true);
  });
});
