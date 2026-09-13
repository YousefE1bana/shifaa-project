import { describe, expect, it } from 'vitest';

import {
  applyDoctorDelay,
  applyDoctorAbsence,
  evaluateQueueOperation,
  queueProducers,
  queueStates,
  type QueueEntry,
  type QueueScope,
} from './queue-policy.js';

const facilityId = '90000000-0000-4000-8000-000000000001';
const otherFacilityId = '90000000-0000-4000-8000-000000000002';
const doctorId = '91000000-0000-4000-8000-000000000001';
const civilDate = '2026-04-15';

const scope: QueueScope = {
  facilityId,
  doctorId,
  civilDate,
  version: 18,
};

const entry = (
  id: string,
  appointmentId: string,
  state: QueueEntry['state'],
  position: number | null,
  version = 4,
  facility = facilityId,
  estimatedServiceAt:
    | string
    | null = `2026-04-15T10:${String((position ?? 3) * 15).padStart(2, '0')}:00.000Z`,
): QueueEntry => ({
  id,
  appointmentId,
  facilityId: facility,
  doctorId,
  civilDate,
  queueNumber: Number(id.slice(-1)),
  position,
  estimatedServiceAt,
  state,
  version,
});

const waitingA = entry(
  '95000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  'waiting',
  1,
);
const waitingB = entry(
  '95000000-0000-4000-8000-000000000002',
  '93000000-0000-4000-8000-000000000002',
  'waiting',
  2,
);
const waitingC = entry(
  '95000000-0000-4000-8000-000000000003',
  '93000000-0000-4000-8000-000000000003',
  'waiting',
  3,
);
const called = entry(
  '95000000-0000-4000-8000-000000000004',
  '93000000-0000-4000-8000-000000000004',
  'called',
  null,
  7,
);

describe('Feature 009 queue policy', () => {
  it('keeps the exact five states and no in_service producer', () => {
    expect(queueStates).toEqual(['waiting', 'called', 'in_service', 'completed', 'removed']);
    expect(queueProducers).toEqual({
      waiting: ['checkInAppointment'],
      called: ['callQueueEntry'],
      in_service: [],
      completed: ['completeQueueEntry'],
      removed: ['declareDoctorAbsence'],
    });
  });

  it('allows only queue-only waiting-to-called and called-to-completed transitions', () => {
    const calledResult = evaluateQueueOperation({
      operation: 'callQueueEntry',
      current: waitingA,
      expectedVersion: waitingA.version,
    });
    expect(calledResult).toMatchObject({
      allowed: true,
      nextState: 'called',
      producer: 'callQueueEntry',
      appointmentStateChanged: false,
    });
    expect(calledResult.allowed && calledResult.nextEntry).toMatchObject({
      state: 'called',
      version: waitingA.version + 1,
      appointmentId: waitingA.appointmentId,
    });

    const completedResult = evaluateQueueOperation({
      operation: 'completeQueueEntry',
      current: called,
      expectedVersion: called.version,
    });
    expect(completedResult).toMatchObject({
      allowed: true,
      nextState: 'completed',
      producer: 'completeQueueEntry',
      appointmentStateChanged: false,
    });

    for (const state of queueStates.filter((value) => value !== 'waiting')) {
      expect(
        evaluateQueueOperation({
          operation: 'callQueueEntry',
          current: { ...waitingA, state },
          expectedVersion: waitingA.version,
        }),
      ).toMatchObject({ allowed: false, code: 'state-transition-invalid' });
    }
    for (const state of queueStates.filter((value) => value !== 'called')) {
      expect(
        evaluateQueueOperation({
          operation: 'completeQueueEntry',
          current: { ...called, state },
          expectedVersion: called.version,
        }),
      ).toMatchObject({ allowed: false, code: 'state-transition-invalid' });
    }
  });

  it('creates only a waiting entry for check-in and never creates in_service', () => {
    const result = evaluateQueueOperation({
      operation: 'checkInAppointment',
      appointmentId: waitingA.appointmentId,
      appointmentState: 'checked_in',
      scope,
      queueNumber: 11,
    });
    expect(result).toMatchObject({
      allowed: true,
      nextState: 'waiting',
      producer: 'checkInAppointment',
    });
    expect(result.allowed && result.nextEntry).toMatchObject({
      appointmentId: waitingA.appointmentId,
      queueNumber: 11,
      state: 'waiting',
      position: 1,
    });
    expect(
      evaluateQueueOperation({
        operation: 'checkInAppointment',
        appointmentId: waitingA.appointmentId,
        appointmentState: 'in_service',
        scope,
        queueNumber: 12,
      }),
    ).toMatchObject({ allowed: false, code: 'appointment-state-invalid' });
  });

  it('reorders only waiting entries with exact scope/version, bounded reason, target, and deterministic projections', () => {
    const result = evaluateQueueOperation({
      operation: 'reorderQueueEntry',
      current: waitingA,
      entries: [waitingA, waitingB, waitingC, called],
      scope,
      expectedVersion: waitingA.version,
      expectedQueueVersion: scope.version,
      targetPosition: 3,
      reason: 'urgent clinic coverage',
    });

    expect(result).toMatchObject({
      allowed: true,
      nextState: 'waiting',
      producer: 'reorderQueueEntry',
      queueVersion: scope.version + 1,
      appointmentStateChanged: false,
      reason: 'urgent clinic coverage',
    });
    expect(result.allowed && result.entries?.map(({ id }) => id)).toEqual([
      waitingB.id,
      waitingC.id,
      waitingA.id,
      called.id,
    ]);
    expect(result.allowed && result.entries?.slice(0, 3)).toMatchObject([
      {
        id: waitingB.id,
        position: 1,
        version: waitingB.version + 1,
        estimatedServiceAt: '2026-04-15T10:15:00.000Z',
      },
      {
        id: waitingC.id,
        position: 2,
        version: waitingC.version + 1,
        estimatedServiceAt: '2026-04-15T10:30:00.000Z',
      },
      {
        id: waitingA.id,
        position: 3,
        version: waitingA.version + 1,
        estimatedServiceAt: '2026-04-15T10:45:00.000Z',
      },
    ]);
    expect(result.allowed && result.entries?.[3]).toEqual(called);
    expect(result.allowed && result.appointmentStateChanged).toBe(false);
  });

  it('denies stale, out-of-scope, non-waiting, invalid-target, and invalid-reason reorder attempts', () => {
    const base = {
      operation: 'reorderQueueEntry' as const,
      current: waitingA,
      entries: [waitingA, waitingB, waitingC],
      scope,
      expectedVersion: waitingA.version,
      expectedQueueVersion: scope.version,
      targetPosition: 2,
      reason: 'valid reason',
    };
    expect(
      evaluateQueueOperation({ ...base, expectedQueueVersion: scope.version - 1 }),
    ).toMatchObject({ allowed: false, code: 'version-conflict' });
    expect(
      evaluateQueueOperation({ ...base, expectedVersion: waitingA.version - 1 }),
    ).toMatchObject({ allowed: false, code: 'version-conflict' });
    expect(evaluateQueueOperation({ ...base, targetPosition: 0 })).toMatchObject({
      allowed: false,
      code: 'target-invalid',
    });
    expect(evaluateQueueOperation({ ...base, targetPosition: 4 })).toMatchObject({
      allowed: false,
      code: 'target-invalid',
    });
    expect(evaluateQueueOperation({ ...base, reason: '   ' })).toMatchObject({
      allowed: false,
      code: 'reason-invalid',
    });
    expect(evaluateQueueOperation({ ...base, reason: 'x'.repeat(501) })).toMatchObject({
      allowed: false,
      code: 'reason-invalid',
    });
    expect(
      evaluateQueueOperation({ ...base, current: { ...waitingA, facilityId: otherFacilityId } }),
    ).toMatchObject({ allowed: false, code: 'scope-conflict' });
    expect(
      evaluateQueueOperation({ ...base, current: { ...waitingA, state: 'called' } }),
    ).toMatchObject({ allowed: false, code: 'state-transition-invalid' });
  });

  it('applies delay to estimates only, leaves order/state/time unchanged, and supersedes without compounding', () => {
    const entries = [waitingA, waitingB, called];
    const first = applyDoctorDelay({
      entries,
      scope,
      idempotencyKey: 'delay-key-1',
      delayMinutes: 15,
    });
    expect(first).toMatchObject({
      changed: true,
      replay: false,
      overlay: { delayMinutes: 15, version: 19 },
    });
    expect(first.entries.map(({ id }) => id)).toEqual(entries.map(({ id }) => id));
    expect(first.entries.map(({ state }) => state)).toEqual(entries.map(({ state }) => state));
    expect(first.entries.map(({ queueNumber }) => queueNumber)).toEqual(
      entries.map(({ queueNumber }) => queueNumber),
    );
    expect(first.entries.map(({ estimatedServiceAt }) => estimatedServiceAt)).toEqual([
      '2026-04-15T10:30:00.000Z',
      '2026-04-15T10:45:00.000Z',
      '2026-04-15T11:00:00.000Z',
    ]);

    const replay = applyDoctorDelay({
      entries: first.entries,
      scope: { ...scope, version: first.overlay.version },
      currentOverlay: first.overlay,
      idempotencyKey: 'delay-key-1',
      delayMinutes: 15,
    });
    expect(replay).toMatchObject({ changed: false, replay: true, overlay: first.overlay });
    expect(replay.entries).toEqual(first.entries);

    const superseded = applyDoctorDelay({
      entries: first.entries,
      scope: { ...scope, version: first.overlay.version },
      currentOverlay: first.overlay,
      idempotencyKey: 'delay-key-2',
      delayMinutes: 30,
    });
    expect(superseded.overlay).toMatchObject({ delayMinutes: 30, version: 20 });
    expect(superseded.entries.map(({ estimatedServiceAt }) => estimatedServiceAt)).toEqual([
      '2026-04-15T10:45:00.000Z',
      '2026-04-15T11:00:00.000Z',
      '2026-04-15T11:15:00.000Z',
    ]);
  });

  it('rejects same-key delay reuse with different minutes without mutating the projection', () => {
    const entries = [waitingA, called];
    const first = applyDoctorDelay({
      entries,
      scope,
      idempotencyKey: 'delay-key-reused',
      delayMinutes: 15,
    });

    expect(() =>
      applyDoctorDelay({
        entries: first.entries,
        scope: { ...scope, version: first.overlay.version },
        currentOverlay: first.overlay,
        idempotencyKey: 'delay-key-reused',
        delayMinutes: 30,
      }),
    ).toThrowError(expect.objectContaining({ code: 'idempotency-key-reused' }));
    expect(first.entries).toEqual([
      {
        ...waitingA,
        estimatedServiceAt: '2026-04-15T10:30:00.000Z',
        version: waitingA.version + 1,
      },
      { ...called, estimatedServiceAt: '2026-04-15T11:00:00.000Z', version: called.version + 1 },
    ]);
    expect(first.overlay).toMatchObject({ idempotencyKey: 'delay-key-reused', delayMinutes: 15 });
  });

  it('shifts estimates only for active waiting and called entries', () => {
    const inactiveEntries = [
      entry(
        '95000000-0000-4000-8000-000000000005',
        '93000000-0000-4000-8000-000000000005',
        'in_service',
        null,
        8,
        facilityId,
        '2026-04-15T11:00:00.000Z',
      ),
      entry(
        '95000000-0000-4000-8000-000000000006',
        '93000000-0000-4000-8000-000000000006',
        'completed',
        null,
        9,
        facilityId,
        '2026-04-15T11:15:00.000Z',
      ),
      entry(
        '95000000-0000-4000-8000-000000000007',
        '93000000-0000-4000-8000-000000000007',
        'removed',
        null,
        10,
        facilityId,
        '2026-04-15T11:30:00.000Z',
      ),
    ];
    const entries = [waitingA, called, ...inactiveEntries];
    const result = applyDoctorDelay({
      entries,
      scope,
      idempotencyKey: 'delay-active-only',
      delayMinutes: 15,
    });

    expect(result.entries.slice(0, 2).map(({ estimatedServiceAt }) => estimatedServiceAt)).toEqual([
      '2026-04-15T10:30:00.000Z',
      '2026-04-15T11:00:00.000Z',
    ]);
    expect(result.entries.slice(2)).toEqual(inactiveEntries);
  });

  it('removes only affected waiting/called entries for scoped absence and never mutates appointment state', () => {
    const entries = [
      { ...waitingA, appointmentState: 'checked_in' as const },
      { ...waitingB, state: 'called' as const, appointmentState: 'confirmed' as const },
      { ...called, state: 'in_service' as const, appointmentState: 'checked_in' as const },
      {
        ...waitingC,
        state: 'completed' as const,
        position: null,
        appointmentState: 'completed' as const,
      },
      {
        ...waitingA,
        id: '95000000-0000-4000-8000-000000000009',
        facilityId: otherFacilityId,
        appointmentState: 'checked_in' as const,
      },
    ];
    const result = applyDoctorAbsence({
      entries,
      scope,
      affectedAppointmentIds: [waitingA.appointmentId, waitingB.appointmentId],
    });

    expect(result.queueVersion).toBe(scope.version + 1);
    expect(
      result.entries
        .filter(({ state }) => state === 'removed')
        .map(({ appointmentId }) => appointmentId),
    ).toEqual([waitingA.appointmentId, waitingB.appointmentId]);
    expect(
      result.entries.find(
        ({ appointmentId, facilityId }) =>
          appointmentId === waitingA.appointmentId && facilityId === otherFacilityId,
      )?.state,
    ).toBe('waiting');
    expect(result.entries.find(({ state }) => state === 'in_service')?.state).toBe('in_service');
    expect(result.entries.find(({ state }) => state === 'completed')?.state).toBe('completed');
    expect(
      result.entries
        .filter(({ state }) => state === 'removed')
        .map(({ appointmentState }) => appointmentState),
    ).toEqual(['checked_in', 'confirmed']);
  });
});
