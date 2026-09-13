import { expandWeeklyRecurrence } from './recurrence.js';
import type { RecurrenceSlot, WeeklyRecurrence } from './types.js';

export type ScheduleStatus = 'active' | 'paused' | 'retired';
export type AvailabilityExceptionType = 'blocked' | 'added' | 'delay' | 'absence';
export type AvailabilityFreshness = 'fresh' | 'stale' | 'unknown';

export interface AvailabilitySchedule extends WeeklyRecurrence {
  readonly id?: string;
  readonly status?: ScheduleStatus;
  readonly version?: number;
}

export interface AvailabilityException {
  readonly type: AvailabilityExceptionType;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly scheduleId?: string;
  readonly civilDate?: string;
  readonly delayMinutes?: number;
  readonly createdAt?: string;
  readonly active?: boolean;
  readonly supersededAt?: string | null;
}

export interface OccupiedAvailabilityRange {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly facilityId?: string;
  readonly doctorId?: string;
}

export interface AvailabilityFreshnessInput {
  readonly observedAt?: Date | string;
  readonly freshUntil?: Date | string;
  readonly sourceCode?: string;
  readonly expectedSourceCode?: string;
}

export interface AvailabilitySlot extends RecurrenceSlot {
  readonly source: 'base' | 'added';
  readonly confirmable: boolean;
  /** Suggestions are explicitly read-only and never create a hold. */
  readonly hold: false;
  readonly delayMinutes?: number;
}

export interface AvailabilityDerivationInput {
  readonly schedule: AvailabilitySchedule;
  readonly civilDate?: string;
  readonly exceptions?: readonly AvailabilityException[];
  readonly reservations?: readonly OccupiedAvailabilityRange[];
  readonly now?: Date | string;
  readonly freshness?: AvailabilityFreshnessInput;
  readonly facilityId?: string;
  readonly doctorId?: string;
  /** Optional write-path candidate; persisted exceptions are derived as-is. */
  readonly candidateAddedException?: AvailabilityException;
}

export interface AvailabilityResult {
  readonly slots: readonly AvailabilitySlot[];
  readonly exceptions: readonly AvailabilityException[];
  readonly freshness: AvailabilityFreshness;
  readonly confirmable: boolean;
  readonly delayMinutes: number | null;
}

export interface ReplacementSuggestionInput extends AvailabilityDerivationInput {
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly limit?: number;
}

export type AvailabilityValidationCode =
  | 'invalid-range'
  | 'delay-minutes-required'
  | 'delay-minutes-not-allowed'
  | 'same-type-overlap'
  | 'added-base-overlap'
  | 'added-added-overlap'
  | 'added-blocked-overlap'
  | 'added-absence-overlap';

export class AvailabilityValidationError extends RangeError {
  public constructor(
    public readonly code: AvailabilityValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'AvailabilityValidationError';
  }
}

const MS_PER_DAY = 86_400_000;

function instant(value: Date | string): number | undefined {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateEpoch(value: string): number {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed)) {
    throw new RangeError(`Invalid civil date: ${value}`);
  }
  return parsed;
}

function overlaps(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function activeException(exception: AvailabilityException): boolean {
  return exception.active !== false && exception.supersededAt == null;
}

function civilDateForInstant(value: string, timezone: string): string | undefined {
  const parsed = instant(value);
  if (parsed === undefined) return undefined;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const fields: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(parsed))) {
    if (part.type !== 'literal') fields[part.type] = part.value;
  }
  return `${fields['year']}-${fields['month']}-${fields['day']}`;
}

function localStartForInstant(value: string, timezone: string): string {
  const parsed = instant(value);
  if (parsed === undefined) return value;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const fields: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(parsed))) {
    if (part.type !== 'literal') fields[part.type] = part.value;
  }
  return `${fields['hour']}:${fields['minute']}:${fields['second']}`.replace(/:00$/, '');
}

function inRequestedDate(
  exception: AvailabilityException,
  schedule: AvailabilitySchedule,
  civilDate: string | undefined,
): boolean {
  if (civilDate === undefined) return true;
  const exceptionDate =
    exception.civilDate ?? civilDateForInstant(exception.startsAt, schedule.timezone);
  return exceptionDate === civilDate;
}

function matchingExceptions(input: AvailabilityDerivationInput): readonly AvailabilityException[] {
  return (input.exceptions ?? []).filter((exception) => {
    if (!activeException(exception)) return false;
    if (input.schedule.id !== undefined && exception.scheduleId !== undefined) {
      if (exception.scheduleId !== input.schedule.id) return false;
    }
    return inRequestedDate(exception, input.schedule, input.civilDate);
  });
}

function validateException(exception: AvailabilityException): { start: number; end: number } {
  const start = instant(exception.startsAt);
  const end = instant(exception.endsAt);
  const delayMinutes = exception.delayMinutes;
  if (start === undefined || end === undefined || end <= start) {
    throw new AvailabilityValidationError(
      'invalid-range',
      'Availability exception range must be positive.',
    );
  }
  if (
    exception.type === 'delay' &&
    (delayMinutes === undefined || !Number.isInteger(delayMinutes) || delayMinutes <= 0)
  ) {
    throw new AvailabilityValidationError(
      'delay-minutes-required',
      'Delay minutes must be a positive integer.',
    );
  }
  if (exception.type !== 'delay' && exception.delayMinutes !== undefined) {
    throw new AvailabilityValidationError(
      'delay-minutes-not-allowed',
      'Delay minutes require a delay exception.',
    );
  }
  return { start, end };
}

/**
 * Validate the portable exception rules before deriving any slots. The API
 * adapter owns locking/idempotency; this function intentionally only checks
 * the deterministic domain constraints.
 */
export function validateAvailabilityExceptions(
  exceptions: readonly AvailabilityException[],
  baseSlots: readonly RecurrenceSlot[] = [],
): void {
  const ranges = exceptions.map((exception) => ({ exception, ...validateException(exception) }));

  for (let leftIndex = 0; leftIndex < ranges.length; leftIndex += 1) {
    const left = ranges[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < ranges.length; rightIndex += 1) {
      const right = ranges[rightIndex]!;
      if (
        left.exception.type === right.exception.type &&
        left.exception.type !== 'delay' &&
        overlaps(left.start, left.end, right.start, right.end)
      ) {
        if (left.exception.type === 'added') {
          throw new AvailabilityValidationError(
            'added-added-overlap',
            'Added availability exceptions must not overlap.',
          );
        }
        throw new AvailabilityValidationError(
          'same-type-overlap',
          `Positive-duration ${left.exception.type} exceptions must not overlap.`,
        );
      }
    }

    if (left.exception.type !== 'added') continue;
    for (const base of baseSlots) {
      const baseStart = instant(base.startsAt);
      const baseEnd = instant(base.endsAt);
      if (
        baseStart !== undefined &&
        baseEnd !== undefined &&
        overlaps(left.start, left.end, baseStart, baseEnd)
      ) {
        throw new AvailabilityValidationError(
          'added-base-overlap',
          'Added availability overlaps base availability.',
        );
      }
    }
    for (const other of ranges) {
      if (other === left || other.exception.type === 'delay') continue;
      if (!overlaps(left.start, left.end, other.start, other.end)) continue;
      if (other.exception.type === 'added') {
        throw new AvailabilityValidationError(
          'added-added-overlap',
          'Added availability exceptions must not overlap.',
        );
      }
      if (other.exception.type === 'blocked') {
        throw new AvailabilityValidationError(
          'added-blocked-overlap',
          'Added availability cannot enter blocked time.',
        );
      }
      if (other.exception.type === 'absence') {
        throw new AvailabilityValidationError(
          'added-absence-overlap',
          'Added availability cannot enter absent time.',
        );
      }
    }
  }
}

/**
 * Validate one ordinary `added` candidate against already-persisted state.
 * Derivation does not call this path: a later blocker or absence must still
 * be able to suppress an earlier persisted added interval.
 */
export function validateAddedAvailabilityException(
  candidate: AvailabilityException,
  existingExceptions: readonly AvailabilityException[],
  baseSlots: readonly RecurrenceSlot[] = [],
): void {
  if (candidate.type !== 'added') {
    throw new AvailabilityValidationError(
      'invalid-range',
      'Only an added exception can be validated as an added candidate.',
    );
  }
  const activeExisting = existingExceptions.filter(activeException);
  validateAvailabilityExceptions([candidate], baseSlots);
  const candidateRange = { exception: candidate, ...validateException(candidate) };
  for (const existing of activeExisting) {
    const existingRange = { exception: existing, ...validateException(existing) };
    if (
      !overlaps(candidateRange.start, candidateRange.end, existingRange.start, existingRange.end)
    ) {
      continue;
    }
    if (existing.type === 'added') {
      throw new AvailabilityValidationError(
        'added-added-overlap',
        'Added availability exceptions must not overlap.',
      );
    }
    if (existing.type === 'blocked') {
      throw new AvailabilityValidationError(
        'added-blocked-overlap',
        'Added availability cannot enter blocked time.',
      );
    }
    if (existing.type === 'absence') {
      throw new AvailabilityValidationError(
        'added-absence-overlap',
        'Added availability cannot enter absent time.',
      );
    }
  }
  for (const base of baseSlots) {
    const baseStart = instant(base.startsAt);
    const baseEnd = instant(base.endsAt);
    if (
      baseStart !== undefined &&
      baseEnd !== undefined &&
      overlaps(candidateRange.start, candidateRange.end, baseStart, baseEnd)
    ) {
      throw new AvailabilityValidationError(
        'added-base-overlap',
        'Added availability overlaps base availability.',
      );
    }
  }
}

export const validateCandidateAddedException = validateAddedAvailabilityException;

function validatePersistedExceptionConsistency(exceptions: readonly AvailabilityException[]): void {
  const ranges = exceptions.map((exception) => ({ exception, ...validateException(exception) }));
  for (let leftIndex = 0; leftIndex < ranges.length; leftIndex += 1) {
    const left = ranges[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < ranges.length; rightIndex += 1) {
      const right = ranges[rightIndex]!;
      if (
        left.exception.type === right.exception.type &&
        left.exception.type !== 'delay' &&
        overlaps(left.start, left.end, right.start, right.end)
      ) {
        throw new AvailabilityValidationError(
          left.exception.type === 'added' ? 'added-added-overlap' : 'same-type-overlap',
          `Positive-duration ${left.exception.type} exceptions must not overlap.`,
        );
      }
    }
  }
}

/** Freshness follows the existing SHIFAA observedAt/freshUntil convention. */
export function qualifyAvailabilityFreshness(
  freshness: AvailabilityFreshnessInput | undefined,
  now: Date | string,
): AvailabilityFreshness {
  if (!freshness?.observedAt || !freshness.freshUntil) return 'unknown';
  if (
    freshness.expectedSourceCode !== undefined &&
    freshness.sourceCode !== freshness.expectedSourceCode
  ) {
    return 'unknown';
  }
  const observedAt = instant(freshness.observedAt);
  const freshUntil = instant(freshness.freshUntil);
  const current = instant(now);
  if (observedAt === undefined || freshUntil === undefined || current === undefined)
    return 'unknown';
  return observedAt <= current && current <= freshUntil ? 'fresh' : 'stale';
}

function dateSlots(
  schedule: AvailabilitySchedule,
  civilDate: string | undefined,
): RecurrenceSlot[] {
  if (schedule.status === 'paused' || schedule.status === 'retired') return [];
  if (civilDate !== undefined) {
    const requested = dateEpoch(civilDate);
    if (requested < dateEpoch(schedule.validFrom) || requested > dateEpoch(schedule.validTo))
      return [];
    return expandWeeklyRecurrence({ ...schedule, validFrom: civilDate, validTo: civilDate });
  }
  return expandWeeklyRecurrence(schedule);
}

function addedSlot(
  exception: AvailabilityException,
  schedule: AvailabilitySchedule,
  confirmable: boolean,
): AvailabilitySlot {
  const civilDate =
    exception.civilDate ?? civilDateForInstant(exception.startsAt, schedule.timezone) ?? '';
  const localStart = localStartForInstant(exception.startsAt, schedule.timezone);
  const identity = `${exception.startsAt}|${schedule.timezone}|${civilDate}|added:${localStart}`;
  return {
    startsAt: new Date(instant(exception.startsAt)!).toISOString(),
    endsAt: new Date(instant(exception.endsAt)!).toISOString(),
    timezone: schedule.timezone,
    civilDate,
    localStart,
    identity,
    ...(schedule.facilityId === undefined ? {} : { facilityId: schedule.facilityId }),
    ...(schedule.doctorId === undefined ? {} : { doctorId: schedule.doctorId }),
    source: 'added',
    confirmable,
    hold: false,
  };
}

function reserved(
  slot: { startsAt: string; endsAt: string },
  reservations: readonly OccupiedAvailabilityRange[],
  facilityId?: string,
  doctorId?: string,
): boolean {
  const start = instant(slot.startsAt);
  const end = instant(slot.endsAt);
  if (start === undefined || end === undefined) return true;
  return reservations.some((reservation) => {
    if (
      facilityId !== undefined &&
      reservation.facilityId !== undefined &&
      reservation.facilityId !== facilityId
    ) {
      return false;
    }
    if (
      doctorId !== undefined &&
      reservation.doctorId !== undefined &&
      reservation.doctorId !== doctorId
    ) {
      return false;
    }
    const reservationStart = instant(reservation.startsAt);
    const reservationEnd = instant(reservation.endsAt);
    return (
      reservationStart !== undefined &&
      reservationEnd !== undefined &&
      overlaps(start, end, reservationStart, reservationEnd)
    );
  });
}

/** Derive effective availability without persistence, transport, or holds. */
export function deriveAvailability(input: AvailabilityDerivationInput): AvailabilityResult {
  const schedule = input.schedule;
  if (
    (input.facilityId !== undefined && input.facilityId !== schedule.facilityId) ||
    (input.doctorId !== undefined && input.doctorId !== schedule.doctorId)
  ) {
    return {
      slots: [],
      exceptions: [],
      freshness: 'unknown',
      confirmable: false,
      delayMinutes: null,
    };
  }

  const base = dateSlots(schedule, input.civilDate);
  const exceptions = matchingExceptions(input);
  validatePersistedExceptionConsistency(exceptions);
  if (input.candidateAddedException !== undefined) {
    validateAddedAvailabilityException(input.candidateAddedException, exceptions, base);
  }

  const ranges = exceptions.map((exception) => ({ exception, ...validateException(exception) }));
  const blockers = ranges.filter(
    ({ exception }) => exception.type === 'blocked' || exception.type === 'absence',
  );
  const freshness =
    input.now === undefined ? 'unknown' : qualifyAvailabilityFreshness(input.freshness, input.now);
  const confirmable = freshness === 'fresh';
  const reservations = input.reservations ?? [];
  const delayRanges = ranges.filter(({ exception }) => exception.type === 'delay');
  const currentDelay =
    delayRanges
      .sort((left, right) => {
        const leftCreated = left.exception.createdAt ? (instant(left.exception.createdAt) ?? 0) : 0;
        const rightCreated = right.exception.createdAt
          ? (instant(right.exception.createdAt) ?? 0)
          : 0;
        return leftCreated - rightCreated;
      })
      .at(-1)?.exception.delayMinutes ?? null;
  const delayMetadata = currentDelay === null ? {} : { delayMinutes: currentDelay };
  const effectiveBase = base
    .filter((slot) => {
      const start = instant(slot.startsAt)!;
      const end = instant(slot.endsAt)!;
      return !blockers.some(({ start: blockedStart, end: blockedEnd }) =>
        overlaps(start, end, blockedStart, blockedEnd),
      );
    })
    .filter((slot) => !reserved(slot, reservations, schedule.facilityId, schedule.doctorId))
    .map(
      (slot): AvailabilitySlot => ({
        ...slot,
        source: 'base',
        confirmable,
        hold: false,
        ...delayMetadata,
      }),
    );

  const effectiveAdded = ranges
    .filter(({ exception }) => exception.type === 'added')
    .map(({ exception }) => ({ ...addedSlot(exception, schedule, confirmable), ...delayMetadata }))
    .filter((slot) => {
      const start = instant(slot.startsAt)!;
      const end = instant(slot.endsAt)!;
      return !blockers.some(({ start: blockedStart, end: blockedEnd }) =>
        overlaps(start, end, blockedStart, blockedEnd),
      );
    })
    .filter((slot) => !reserved(slot, reservations, schedule.facilityId, schedule.doctorId));

  return {
    slots: [...effectiveBase, ...effectiveAdded].sort((left, right) =>
      left.startsAt.localeCompare(right.startsAt),
    ),
    exceptions,
    freshness,
    confirmable,
    delayMinutes: currentDelay,
  };
}

/**
 * Return read-only, earliest-first offers. This function never mutates input,
 * reserves a slot, or changes the slot's scheduled instant.
 */
export function suggestReplacementSlots(
  input: ReplacementSuggestionInput,
): readonly AvailabilitySlot[] {
  const fromDate = input.fromDate ?? input.schedule.validFrom;
  const toDate = input.toDate ?? input.schedule.validTo;
  const from = dateEpoch(fromDate);
  const to = dateEpoch(toDate);
  if (to < from) throw new RangeError('toDate must be on or after fromDate');
  const current = input.now === undefined ? undefined : instant(input.now);
  const limit = input.limit ?? Number.POSITIVE_INFINITY;
  if (!Number.isInteger(limit) || limit <= 0) return [];

  const suggestions: AvailabilitySlot[] = [];
  for (let epoch = from; epoch <= to && suggestions.length < limit; epoch += MS_PER_DAY) {
    const civilDate = new Date(epoch).toISOString().slice(0, 10);
    const result = deriveAvailability({ ...input, civilDate });
    for (const slot of result.slots) {
      if (current !== undefined && instant(slot.startsAt)! <= current) continue;
      suggestions.push(slot);
      if (suggestions.length >= limit) break;
    }
  }
  return suggestions
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .slice(0, limit);
}

export const availabilityFreshness = qualifyAvailabilityFreshness;
export const deriveDoctorAvailability = deriveAvailability;
