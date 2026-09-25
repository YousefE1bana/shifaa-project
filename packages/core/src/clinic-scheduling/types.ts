/** ISO weekday values used by the bounded weekly schedule contract. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface LocalWindow {
  isoWeekday: IsoWeekday;
  localStart: string;
  localEnd: string;
}

/** A schedule's weekly wall-clock recurrence and inclusive civil validity. */
export interface WeeklyRecurrence {
  timezone: string;
  validFrom: string;
  validTo: string;
  slotDurationMinutes: number;
  windows: readonly LocalWindow[];
  facilityId?: string;
  doctorId?: string;
}

export interface CivilDateTimeInput {
  timezone: string;
  civilDate: string;
  localTime: string;
}

export interface ResolvedCivilDateTime {
  /** An unambiguous UTC instant, represented in canonical ISO form. */
  instant: string;
  /** The selected IANA-zone offset at `instant`, in minutes east of UTC. */
  offsetMinutes: number;
}

export interface RecurrenceSlot {
  startsAt: string;
  endsAt: string;
  timezone: string;
  civilDate: string;
  localStart: string;
  identity: string;
  facilityId?: string;
  doctorId?: string;
}
