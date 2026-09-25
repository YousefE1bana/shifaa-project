/**
 * Framework-free appointment state and payment policy for Feature 009.
 *
 * Persistence, authorization, idempotency, and slot exclusion belong to the
 * API/database adapters. This module only evaluates the portable domain rule
 * and returns a decision that callers can apply atomically.
 */

export const appointmentStates = [
  'requested',
  'confirmed',
  'checked_in',
  'in_queue',
  'in_consultation',
  'completed',
  'cancelled',
  'no_show',
  'reschedule_required',
] as const;

export type AppointmentState = (typeof appointmentStates)[number];

export const appointmentOperations = [
  'createAppointment',
  'cancelAppointment',
  'rescheduleAppointment',
  'checkInAppointment',
] as const;

export type AppointmentOperation = (typeof appointmentOperations)[number];
export type PaymentMethod = 'cash_on_arrival';

/** The only state producers available to Feature 009. */
export const appointmentProducers: Readonly<
  Record<AppointmentState, readonly AppointmentOperation[] | readonly ['declareDoctorAbsence']>
> = {
  requested: [],
  confirmed: ['createAppointment', 'rescheduleAppointment'],
  checked_in: ['checkInAppointment'],
  in_queue: [],
  in_consultation: [],
  completed: [],
  cancelled: ['cancelAppointment'],
  no_show: [],
  reschedule_required: ['declareDoctorAbsence'],
};

export type AppointmentModel = {
  readonly id: string;
  readonly state: AppointmentState;
  readonly version: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly paymentMethod: PaymentMethod;
};

export type AppointmentSlot = {
  readonly startsAt: string;
  readonly endsAt: string;
  /** Availability is supplied by the authoritative availability policy. */
  readonly available?: boolean;
};

export type AppointmentPolicyInput = {
  readonly operation: AppointmentOperation;
  readonly now: Date | string;
  readonly current?: AppointmentModel;
  readonly expectedVersion?: number;
  readonly slot?: AppointmentSlot;
  /** A database exclusion/concurrency result supplied by the adapter. */
  readonly conflict?: boolean;
  /** Synthetic transaction failure injection for proving atomic rollback. */
  readonly transaction?: 'ok' | 'failed';
  /** Requests cannot select a different payment rail. */
  readonly paymentMethod?: string;
};

export type AppointmentPolicyCode =
  | 'allowed'
  | 'invalid-current-time'
  | 'payment-method-disabled'
  | 'appointment-required'
  | 'version-required'
  | 'version-conflict'
  | 'state-transition-invalid'
  | 'pre-start-required'
  | 'slot-required'
  | 'replacement-invalid'
  | 'slot-conflict'
  | 'transaction-failed';

type DecisionBase = {
  readonly operation: AppointmentOperation;
  readonly paymentMethod: PaymentMethod;
  readonly refund: false;
  readonly financialEffects: readonly [];
  readonly originalAppointment?: AppointmentModel;
  readonly replacementAcquired: boolean;
};

export type AppointmentPolicyDecision =
  | (DecisionBase & {
      readonly allowed: true;
      readonly code: 'allowed';
      readonly nextState: AppointmentState;
      readonly nextAppointment?: AppointmentModel;
      readonly producer: AppointmentOperation;
      readonly queueState?: 'waiting';
    })
  | (DecisionBase & {
      readonly allowed: false;
      readonly code: Exclude<AppointmentPolicyCode, 'allowed'>;
    });

export class AppointmentPolicyError extends Error {
  public constructor(
    public readonly code: Exclude<AppointmentPolicyCode, 'allowed'>,
    message: string,
  ) {
    super(message);
    this.name = 'AppointmentPolicyError';
  }
}

function parseInstant(value: Date | string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function decisionBase(input: AppointmentPolicyInput): DecisionBase {
  return {
    operation: input.operation,
    paymentMethod: 'cash_on_arrival',
    refund: false,
    financialEffects: [],
    ...(input.current ? { originalAppointment: input.current } : {}),
    replacementAcquired: false,
  };
}

function denyOperation(
  input: AppointmentPolicyInput,
  code: Exclude<AppointmentPolicyCode, 'allowed'>,
): AppointmentPolicyDecision {
  return {
    allowed: false,
    code,
    ...decisionBase(input),
  };
}

function allowOperation(
  input: AppointmentPolicyInput,
  nextState: AppointmentState,
  nextAppointment?: AppointmentModel,
  queueState?: 'waiting',
): AppointmentPolicyDecision {
  return {
    allowed: true,
    code: 'allowed',
    ...decisionBase(input),
    operation: input.operation,
    nextState,
    ...(nextAppointment ? { nextAppointment } : {}),
    producer: input.operation,
    ...(queueState ? { queueState } : {}),
    replacementAcquired: input.operation === 'rescheduleAppointment',
  };
}

function advanceState(current: AppointmentModel, state: AppointmentState): AppointmentModel {
  return { ...current, state, version: current.version + 1 };
}

function validSlot(slot: AppointmentSlot | undefined, now: number): boolean {
  const start = parseInstant(slot?.startsAt);
  const end = parseInstant(slot?.endsAt);
  return (
    start !== undefined &&
    end !== undefined &&
    start > now &&
    end > start &&
    slot?.available !== false
  );
}

/**
 * Evaluate one Feature 009 appointment operation without mutating the model.
 *
 * The adapter must still perform authorization, idempotency, and the atomic
 * database write. A denied reschedule always carries the untouched original
 * model and never claims that its replacement slot was acquired.
 */
export function evaluateAppointmentOperation(
  input: AppointmentPolicyInput,
): AppointmentPolicyDecision {
  const now = parseInstant(input.now);
  if (now === undefined) return denyOperation(input, 'invalid-current-time');
  if (input.paymentMethod !== undefined && input.paymentMethod !== 'cash_on_arrival') {
    return denyOperation(input, 'payment-method-disabled');
  }
  if (input.transaction === 'failed') return denyOperation(input, 'transaction-failed');

  if (input.operation === 'createAppointment') return evaluateCreate(input, now);

  const current = input.current;
  if (!current) return denyOperation(input, 'appointment-required');
  if (input.expectedVersion === undefined) return denyOperation(input, 'version-required');
  if (current.version !== input.expectedVersion) return denyOperation(input, 'version-conflict');
  if (current.paymentMethod !== 'cash_on_arrival')
    return denyOperation(input, 'payment-method-disabled');
  return evaluateExisting(input, current, now);
}

function evaluateCreate(input: AppointmentPolicyInput, now: number): AppointmentPolicyDecision {
  if (!validSlot(input.slot, now)) return denyOperation(input, 'slot-required');
  if (input.conflict) return denyOperation(input, 'slot-conflict');
  return allowOperation(input, 'confirmed');
}

function evaluateExisting(
  input: AppointmentPolicyInput,
  current: AppointmentModel,
  now: number,
): AppointmentPolicyDecision {
  if (input.operation === 'cancelAppointment') {
    return evaluateCancellation(input, current, now);
  }
  if (input.operation === 'checkInAppointment') {
    if (current.state !== 'confirmed') return denyOperation(input, 'state-transition-invalid');
    return allowOperation(input, 'checked_in', advanceState(current, 'checked_in'), 'waiting');
  }

  return evaluateReschedule(input, current, now);
}

function evaluateCancellation(
  input: AppointmentPolicyInput,
  current: AppointmentModel,
  now: number,
): AppointmentPolicyDecision {
  if (current.state === 'reschedule_required') {
    return allowOperation(input, 'cancelled', advanceState(current, 'cancelled'));
  }
  if (current.state !== 'confirmed') return denyOperation(input, 'state-transition-invalid');
  const startsAt = parseInstant(current.startsAt);
  if (startsAt === undefined || now >= startsAt) return denyOperation(input, 'pre-start-required');
  return allowOperation(input, 'cancelled', advanceState(current, 'cancelled'));
}

function evaluateReschedule(
  input: AppointmentPolicyInput,
  current: AppointmentModel,
  now: number,
): AppointmentPolicyDecision {
  if (current.state !== 'confirmed' && current.state !== 'reschedule_required') {
    return denyOperation(input, 'state-transition-invalid');
  }
  if (current.state === 'confirmed') {
    const startsAt = parseInstant(current.startsAt);
    if (startsAt === undefined || now >= startsAt)
      return denyOperation(input, 'pre-start-required');
  }
  if (!validSlot(input.slot, now)) return denyOperation(input, 'replacement-invalid');
  if (input.conflict) return denyOperation(input, 'slot-conflict');
  return allowOperation(input, 'confirmed', {
    ...current,
    state: 'confirmed',
    startsAt: input.slot!.startsAt,
    endsAt: input.slot!.endsAt,
    version: current.version + 1,
  });
}

/** Throwing adapter-friendly form of the policy decision. */
export function transitionAppointment(
  input: AppointmentPolicyInput,
): Exclude<AppointmentPolicyDecision, { allowed: false }> {
  const result = evaluateAppointmentOperation(input);
  if (!result.allowed) {
    throw new AppointmentPolicyError(result.code, `Appointment operation denied: ${result.code}.`);
  }
  return result;
}

export function canProduceAppointmentState(state: AppointmentState, operation: string): boolean {
  return (appointmentProducers[state] as readonly string[]).includes(operation);
}
