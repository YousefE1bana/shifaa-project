/**
 * Framework-free queue policy for Feature 009.
 *
 * This module returns immutable projections only. Authorization, idempotency,
 * scope locks, audit, outbox, and the database transaction remain adapter
 * responsibilities. In particular, queue operations never advance an
 * appointment state; absence callers must apply the appointment transition in
 * the appointment policy transaction alongside this queue projection.
 */

export const queueStates = ['waiting', 'called', 'in_service', 'completed', 'removed'] as const;

export type QueueState = (typeof queueStates)[number];

export const queueOperations = [
  'checkInAppointment',
  'callQueueEntry',
  'reorderQueueEntry',
  'completeQueueEntry',
  'sendDoctorDelay',
  'declareDoctorAbsence',
] as const;

export type QueueOperation = (typeof queueOperations)[number];

/** The only Feature 009 operation that produces each queue state. */
export const queueProducers: Readonly<Record<QueueState, readonly QueueOperation[]>> = {
  waiting: ['checkInAppointment'],
  called: ['callQueueEntry'],
  in_service: [],
  completed: ['completeQueueEntry'],
  removed: ['declareDoctorAbsence'],
};

export type QueueEntry = {
  readonly id: string;
  readonly appointmentId: string;
  readonly facilityId: string;
  readonly doctorId: string;
  readonly civilDate: string;
  /** Queue numbers are allocated once and never change during reorder. */
  readonly queueNumber: number;
  /** Position is meaningful only while waiting. */
  readonly position: number | null;
  readonly estimatedServiceAt?: string | null;
  readonly state: QueueState;
  readonly version: number;
  /** Optional test/adapter projection; this policy intentionally preserves it. */
  readonly appointmentState?: string;
};

export type QueueScope = {
  readonly facilityId: string;
  readonly doctorId: string;
  readonly civilDate: string;
  readonly version: number;
};

export type QueuePolicyInput = {
  readonly operation: QueueOperation;
  readonly current?: QueueEntry;
  readonly entries?: readonly QueueEntry[];
  readonly scope?: QueueScope;
  readonly expectedVersion?: number;
  /** Canonical request name for the queue-scope version. */
  readonly queueVersion?: number;
  readonly expectedQueueVersion?: number;
  readonly targetPosition?: number;
  readonly reason?: string;
  readonly appointmentId?: string;
  readonly appointmentState?: string;
  readonly queueEntryId?: string;
  readonly queueNumber?: number;
};

export type QueuePolicyCode =
  | 'allowed'
  | 'queue-entry-required'
  | 'version-required'
  | 'version-conflict'
  | 'state-transition-invalid'
  | 'scope-required'
  | 'scope-conflict'
  | 'idempotency-key-reused'
  | 'entries-required'
  | 'target-invalid'
  | 'reason-invalid'
  | 'appointment-required'
  | 'appointment-state-invalid'
  | 'queue-number-invalid'
  | 'queue-order-invalid';

type QueueDecisionBase = {
  readonly operation: QueueOperation;
  /** Queue policy has no authority to mutate the appointment aggregate. */
  readonly appointmentStateChanged: false;
};

export type QueuePolicyDecision =
  | (QueueDecisionBase & {
      readonly allowed: true;
      readonly code: 'allowed';
      readonly nextState: QueueState;
      readonly producer: QueueOperation;
      readonly nextEntry?: QueueEntry;
      readonly entries?: readonly QueueEntry[];
      readonly queueVersion?: number;
      readonly reason?: string;
    })
  | (QueueDecisionBase & {
      readonly allowed: false;
      readonly code: Exclude<QueuePolicyCode, 'allowed'>;
    });

export class QueuePolicyError extends Error {
  public constructor(
    public readonly code: Exclude<QueuePolicyCode, 'allowed'>,
    message: string,
  ) {
    super(message);
    this.name = 'QueuePolicyError';
  }
}

export type QueueDelayOverlay = {
  readonly facilityId: string;
  readonly doctorId: string;
  readonly civilDate: string;
  readonly delayMinutes: number;
  readonly idempotencyKey: string;
  readonly version: number;
};

export type DoctorDelayInput = {
  readonly entries: readonly QueueEntry[];
  readonly scope: QueueScope;
  readonly currentOverlay?: QueueDelayOverlay;
  readonly idempotencyKey: string;
  readonly delayMinutes: number;
};

export type DoctorDelayResult = {
  readonly changed: boolean;
  readonly replay: boolean;
  readonly entries: readonly QueueEntry[];
  readonly overlay: QueueDelayOverlay;
};

export type DoctorAbsenceInput = {
  readonly entries: readonly QueueEntry[];
  readonly scope: QueueScope;
  /** The appointment set was computed by the appointment/absence policy. */
  readonly affectedAppointmentIds: readonly string[];
};

export type DoctorAbsenceResult = {
  readonly entries: readonly QueueEntry[];
  readonly queueVersion: number;
  readonly removedQueueEntryIds: readonly string[];
};

function baseDecision(operation: QueueOperation): QueueDecisionBase {
  return { operation, appointmentStateChanged: false };
}

function deny(
  operation: QueueOperation,
  code: Exclude<QueuePolicyCode, 'allowed'>,
): QueuePolicyDecision {
  return { ...baseDecision(operation), allowed: false, code };
}

function allow(
  operation: QueueOperation,
  nextState: QueueState,
  producer: QueueOperation,
  fields: Omit<
    Extract<QueuePolicyDecision, { allowed: true }>,
    keyof QueueDecisionBase | 'allowed' | 'code' | 'nextState' | 'producer'
  > = {},
): QueuePolicyDecision {
  return {
    ...baseDecision(operation),
    allowed: true,
    code: 'allowed',
    nextState,
    producer,
    ...fields,
  };
}

function sameScope(entry: QueueEntry, scope: QueueScope): boolean {
  return (
    entry.facilityId === scope.facilityId &&
    entry.doctorId === scope.doctorId &&
    entry.civilDate === scope.civilDate
  );
}

function validReason(reason: string | undefined): reason is string {
  if (reason === undefined) return false;
  const normalized = reason.trim();
  return (
    normalized.length > 0 && normalized.length <= 500 && !/[\u0000-\u001f\u007f]/u.test(normalized)
  );
}

function validPositiveInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0;
}

function validWaitingOrder(entries: readonly QueueEntry[]): boolean {
  const positions = entries.map(({ position }) => position);
  return positions.every((position, index) => position === index + 1);
}

function reorderWaitingEntries(
  entries: readonly QueueEntry[],
  currentId: string,
  targetPosition: number,
): readonly QueueEntry[] {
  const waiting = entries
    .filter(({ state }) => state === 'waiting')
    .sort(
      (a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER),
    );
  const currentIndex = waiting.findIndex(({ id }) => id === currentId);
  const reordered = [...waiting];
  const [moved] = reordered.splice(currentIndex, 1);
  if (moved === undefined) return waiting;
  reordered.splice(targetPosition - 1, 0, moved);

  // Estimates belong to waiting positions, not queue numbers. Reusing the
  // original position slots makes the recalculation deterministic and avoids
  // silently inventing service-time policy in the portable core.
  return reordered.map((item, index) => ({
    ...item,
    position: index + 1,
    estimatedServiceAt: waiting[index]?.estimatedServiceAt ?? null,
  }));
}

function evaluateCheckIn(input: QueuePolicyInput): QueuePolicyDecision {
  if (input.current) return deny(input.operation, 'queue-entry-required');
  if (input.appointmentId === undefined) return deny(input.operation, 'appointment-required');
  if (input.appointmentState !== 'checked_in') {
    return deny(input.operation, 'appointment-state-invalid');
  }
  if (input.scope === undefined) return deny(input.operation, 'scope-required');
  if (!validPositiveInteger(input.queueNumber))
    return deny(input.operation, 'queue-number-invalid');

  const nextEntry: QueueEntry = {
    id: input.queueEntryId ?? `queue-entry:${input.appointmentId}`,
    appointmentId: input.appointmentId,
    facilityId: input.scope.facilityId,
    doctorId: input.scope.doctorId,
    civilDate: input.scope.civilDate,
    queueNumber: input.queueNumber,
    position: 1,
    estimatedServiceAt: null,
    state: 'waiting',
    version: 1,
  };
  return allow(input.operation, 'waiting', 'checkInAppointment', { nextEntry });
}

function evaluateStateTransition(input: QueuePolicyInput): QueuePolicyDecision {
  const current = input.current;
  if (!current) return deny(input.operation, 'queue-entry-required');
  if (input.expectedVersion === undefined) return deny(input.operation, 'version-required');
  if (current.version !== input.expectedVersion) return deny(input.operation, 'version-conflict');

  const expectedState = input.operation === 'callQueueEntry' ? 'waiting' : 'called';
  const nextState = input.operation === 'callQueueEntry' ? 'called' : 'completed';
  if (current.state !== expectedState) return deny(input.operation, 'state-transition-invalid');

  const nextEntry: QueueEntry = {
    ...current,
    state: nextState,
    position: nextState === 'called' ? null : current.position,
    version: current.version + 1,
  };
  const queueVersion = input.scope ? input.scope.version + 1 : undefined;
  return allow(input.operation, nextState, input.operation, {
    nextEntry,
    ...(queueVersion === undefined ? {} : { queueVersion }),
  });
}

function evaluateReorder(input: QueuePolicyInput): QueuePolicyDecision {
  const current = input.current;
  if (!current) return deny(input.operation, 'queue-entry-required');
  if (!input.entries) return deny(input.operation, 'entries-required');
  if (!input.scope) return deny(input.operation, 'scope-required');
  const entries = input.entries;
  const scope = input.scope;
  const expectedQueueVersion = input.queueVersion ?? input.expectedQueueVersion;
  if (input.expectedVersion === undefined || expectedQueueVersion === undefined) {
    return deny(input.operation, 'version-required');
  }
  if (current.version !== input.expectedVersion) {
    return deny(input.operation, 'version-conflict');
  }
  if (scope.version !== expectedQueueVersion) {
    return deny(input.operation, 'version-conflict');
  }
  if (!entries.some(({ id }) => id === current.id)) {
    return deny(input.operation, 'queue-entry-required');
  }
  if (!sameScope(current, scope) || entries.some((item) => !sameScope(item, scope))) {
    return deny(input.operation, 'scope-conflict');
  }
  if (current.state !== 'waiting') return deny(input.operation, 'state-transition-invalid');
  if (!validReason(input.reason)) return deny(input.operation, 'reason-invalid');

  const waiting = entries.filter(({ state }) => state === 'waiting');
  if (!validWaitingOrder(waiting)) return deny(input.operation, 'queue-order-invalid');
  const targetPosition = input.targetPosition;
  if (!validPositiveInteger(targetPosition) || targetPosition > waiting.length) {
    return deny(input.operation, 'target-invalid');
  }

  const reorderedWaiting = reorderWaitingEntries(entries, current.id, targetPosition);
  if (reorderedWaiting.length !== waiting.length)
    return deny(input.operation, 'queue-order-invalid');
  const originalById = new Map(entries.map((item) => [item.id, item]));
  const projectedWaiting = reorderedWaiting.map((next) => {
    const original = originalById.get(next.id);
    if (!original) return next;
    const changed =
      next.position !== original.position ||
      next.estimatedServiceAt !== original.estimatedServiceAt;
    return changed ? { ...next, version: original.version + 1 } : original;
  });
  // Queue reads are ordered by waiting position first; terminal/non-waiting
  // entries retain their existing relative order after that projection.
  const nextEntries = [...projectedWaiting, ...entries.filter(({ state }) => state !== 'waiting')];
  const changed = nextEntries.some((item, index) => item !== entries[index]);
  return allow(input.operation, 'waiting', 'reorderQueueEntry', {
    entries: nextEntries,
    queueVersion: scope.version + (changed ? 1 : 0),
    reason: input.reason.trim(),
  });
}

/** Evaluate one queue operation without mutating its input models. */
export function evaluateQueueOperation(input: QueuePolicyInput): QueuePolicyDecision {
  if (input.operation === 'checkInAppointment') return evaluateCheckIn(input);
  if (input.operation === 'callQueueEntry' || input.operation === 'completeQueueEntry') {
    return evaluateStateTransition(input);
  }
  if (input.operation === 'reorderQueueEntry') return evaluateReorder(input);
  return deny(input.operation, 'state-transition-invalid');
}

function assertDelayInput(input: DoctorDelayInput): void {
  if (input.idempotencyKey.trim().length === 0) {
    throw new QueuePolicyError('reason-invalid', 'A delay idempotency key is required.');
  }
  if (
    !Number.isSafeInteger(input.delayMinutes) ||
    input.delayMinutes < 1 ||
    input.delayMinutes > 1440
  ) {
    throw new QueuePolicyError('target-invalid', 'Delay minutes must be between 1 and 1440.');
  }
  if (
    input.currentOverlay &&
    (input.currentOverlay.facilityId !== input.scope.facilityId ||
      input.currentOverlay.doctorId !== input.scope.doctorId ||
      input.currentOverlay.civilDate !== input.scope.civilDate)
  ) {
    throw new QueuePolicyError('scope-conflict', 'The delay overlay is outside the queue scope.');
  }
}

function shiftEstimate(value: string | null, deltaMinutes: number): string | null {
  if (value === null || deltaMinutes === 0) return value;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp + deltaMinutes * 60_000).toISOString();
}

/**
 * Apply a scoped delay overlay to estimates only.
 *
 * Supersession uses the delta from the prior overlay, so passing the latest
 * authoritative projection cannot compound delay minutes. A replay with the
 * same idempotency key is intentionally inert.
 */
export function applyDoctorDelay(input: DoctorDelayInput): DoctorDelayResult {
  assertDelayInput(input);
  const current = input.currentOverlay;
  if (current?.idempotencyKey === input.idempotencyKey) {
    if (current.delayMinutes !== input.delayMinutes) {
      throw new QueuePolicyError(
        'idempotency-key-reused',
        'The delay idempotency key is already bound to a different request.',
      );
    }
    return { changed: false, replay: true, entries: input.entries, overlay: current };
  }

  const delta = input.delayMinutes - (current?.delayMinutes ?? 0);
  const overlay: QueueDelayOverlay = {
    facilityId: input.scope.facilityId,
    doctorId: input.scope.doctorId,
    civilDate: input.scope.civilDate,
    delayMinutes: input.delayMinutes,
    idempotencyKey: input.idempotencyKey,
    version: input.scope.version + 1,
  };
  const entries = input.entries.map((entry) => {
    if (!sameScope(entry, input.scope) || (entry.state !== 'waiting' && entry.state !== 'called')) {
      return entry;
    }
    const estimatedServiceAt = shiftEstimate(entry.estimatedServiceAt ?? null, delta);
    return estimatedServiceAt === entry.estimatedServiceAt
      ? entry
      : { ...entry, estimatedServiceAt, version: entry.version + 1 };
  });
  return { changed: true, replay: false, entries, overlay };
}

/**
 * Remove the exact affected queue entries for an absence.
 *
 * Appointment state is deliberately opaque and preserved. The appointment
 * policy owns the paired `confirmed|checked_in -> reschedule_required`
 * transition in the enclosing transaction.
 */
export function applyDoctorAbsence(input: DoctorAbsenceInput): DoctorAbsenceResult {
  const affected = new Set(input.affectedAppointmentIds);
  const removedQueueEntryIds: string[] = [];
  const entries = input.entries.map((entry) => {
    if (
      !sameScope(entry, input.scope) ||
      !affected.has(entry.appointmentId) ||
      (entry.state !== 'waiting' && entry.state !== 'called')
    ) {
      return entry;
    }
    removedQueueEntryIds.push(entry.id);
    return {
      ...entry,
      state: 'removed' as const,
      position: null,
      estimatedServiceAt: null,
      version: entry.version + 1,
    };
  });
  return {
    entries,
    queueVersion: input.scope.version + (removedQueueEntryIds.length > 0 ? 1 : 0),
    removedQueueEntryIds,
  };
}

export function canProduceQueueState(state: QueueState, operation: string): boolean {
  return (queueProducers[state] as readonly string[]).includes(operation);
}
