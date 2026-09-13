import type {
  CivilDateTimeInput,
  IsoWeekday,
  LocalWindow,
  RecurrenceSlot,
  ResolvedCivilDateTime,
  WeeklyRecurrence,
} from './types.js';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

type ParsedDate = { year: number; month: number; day: number; epoch: number };
type ParsedTime = { hour: number; minute: number; second: number; totalSeconds: number };
type ZonedParts = ParsedDate & ParsedTime;

function parseCivilDate(value: string): ParsedDate {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError(`Invalid civil date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const epoch = Date.UTC(year, month - 1, day);
  const date = new Date(epoch);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid civil date: ${value}`);
  }
  return { year, month, day, epoch };
}

function parseLocalTime(value: string): ParsedTime {
  const match = LOCAL_TIME_PATTERN.exec(value);
  if (!match) throw new RangeError(`Invalid local time: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new RangeError(`Invalid local time: ${value}`);
  }
  return { hour, minute, second, totalSeconds: hour * 3600 + minute * 60 + second };
}

function canonicalLocalTime(totalSeconds: number): string {
  const hour = Math.floor(totalSeconds / 3600);
  const minute = Math.floor((totalSeconds % 3600) / 60);
  const second = totalSeconds % 60;
  return second === 0
    ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    : `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function timezoneFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    throw new RangeError(`Invalid IANA timezone: ${timezone}`);
  }
}

function zonedParts(formatter: Intl.DateTimeFormat, instant: number): ZonedParts {
  const fields: Record<string, number> = {};
  for (const { type, value } of formatter.formatToParts(new Date(instant))) {
    if (type !== 'literal') fields[type] = Number(value);
  }
  const field = (name: string): number => {
    const value = fields[name];
    if (value === undefined || Number.isNaN(value))
      throw new RangeError(`Missing timezone field: ${name}`);
    return value;
  };
  const year = field('year');
  const month = field('month');
  const day = field('day');
  const hour = field('hour');
  const minute = field('minute');
  const second = field('second');
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    epoch: Date.UTC(year, month - 1, day),
    totalSeconds: hour * 3600 + minute * 60 + second,
  };
}

function timezoneOffsetMinutes(formatter: Intl.DateTimeFormat, instant: number): number {
  const parts = zonedParts(formatter, instant);
  const representedUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((representedUtc - instant) / MS_PER_MINUTE);
}

function sameCivilTime(parts: ZonedParts, date: ParsedDate, time: ParsedTime): boolean {
  return (
    parts.year === date.year &&
    parts.month === date.month &&
    parts.day === date.day &&
    parts.hour === time.hour &&
    parts.minute === time.minute &&
    parts.second === time.second
  );
}

/**
 * Resolve a local wall-clock value without allowing the host machine timezone
 * to influence the answer. A fold has two candidates; the earlier instant is
 * selected. A gap has no candidate and returns null.
 */
export function resolveCivilDateTime(input: CivilDateTimeInput): ResolvedCivilDateTime | null {
  const date = parseCivilDate(input.civilDate);
  const time = parseLocalTime(input.localTime);
  const formatter = timezoneFormatter(input.timezone);
  const naiveUtc = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
    time.second,
  );

  // Probe a bounded civil neighbourhood to discover both sides of a timezone
  // transition, including zones with a 24-hour date-line change.
  const offsets = new Set<number>();
  for (let hour = -72; hour <= 72; hour += 6) {
    const instant = naiveUtc + hour * 60 * MS_PER_MINUTE;
    offsets.add(timezoneOffsetMinutes(formatter, instant));
  }

  const candidates = [...offsets]
    .map((offsetMinutes) => naiveUtc - offsetMinutes * MS_PER_MINUTE)
    .filter((instant) => sameCivilTime(zonedParts(formatter, instant), date, time))
    .sort((left, right) => left - right);

  const instant = candidates[0];
  if (instant === undefined) return null;
  return {
    instant: new Date(instant).toISOString(),
    offsetMinutes: timezoneOffsetMinutes(formatter, instant),
  };
}

function isoWeekday(epoch: number): IsoWeekday {
  const day = new Date(epoch).getUTCDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

function validateWindows(windows: readonly LocalWindow[]): Map<IsoWeekday, LocalWindow[]> {
  const byDay = new Map<IsoWeekday, LocalWindow[]>();
  for (const window of windows) {
    if (!Number.isInteger(window.isoWeekday) || window.isoWeekday < 1 || window.isoWeekday > 7) {
      throw new RangeError(`Invalid ISO weekday: ${window.isoWeekday}`);
    }
    const start = parseLocalTime(window.localStart).totalSeconds;
    const end = parseLocalTime(window.localEnd).totalSeconds;
    if (end <= start) throw new RangeError('Local windows must be positive and same-day');
    const dayWindows = byDay.get(window.isoWeekday) ?? [];
    dayWindows.push(window);
    byDay.set(window.isoWeekday, dayWindows);
  }
  for (const dayWindows of byDay.values()) {
    dayWindows.sort(
      (left, right) =>
        parseLocalTime(left.localStart).totalSeconds -
        parseLocalTime(right.localStart).totalSeconds,
    );
    for (let index = 1; index < dayWindows.length; index += 1) {
      const previousEnd = parseLocalTime(dayWindows[index - 1]!.localEnd).totalSeconds;
      const currentStart = parseLocalTime(dayWindows[index]!.localStart).totalSeconds;
      if (currentStart < previousEnd) throw new RangeError('Local windows must not overlap');
    }
  }
  return byDay;
}

function nextCivilDay(epoch: number): number {
  return epoch + MS_PER_DAY;
}

/** Expand a bounded weekly schedule over inclusive civil validity dates. */
export function expandWeeklyRecurrence(schedule: WeeklyRecurrence): RecurrenceSlot[] {
  const from = parseCivilDate(schedule.validFrom);
  const to = parseCivilDate(schedule.validTo);
  if (to.epoch < from.epoch) throw new RangeError('validTo must be on or after validFrom');
  if (!Number.isInteger(schedule.slotDurationMinutes) || schedule.slotDurationMinutes <= 0) {
    throw new RangeError('slotDurationMinutes must be a positive integer');
  }
  const windows = validateWindows(schedule.windows);
  timezoneFormatter(schedule.timezone);
  const slots = new Map<string, RecurrenceSlot>();

  for (let dateEpoch = from.epoch; dateEpoch <= to.epoch; dateEpoch = nextCivilDay(dateEpoch)) {
    const civilDate = new Date(dateEpoch).toISOString().slice(0, 10);
    const dayWindows = windows.get(isoWeekday(dateEpoch)) ?? [];
    for (const window of dayWindows) {
      const startSeconds = parseLocalTime(window.localStart).totalSeconds;
      const endSeconds = parseLocalTime(window.localEnd).totalSeconds;
      const durationSeconds = schedule.slotDurationMinutes * 60;
      for (
        let offset = 0;
        startSeconds + offset + durationSeconds <= endSeconds;
        offset += durationSeconds
      ) {
        const totalSeconds = startSeconds + offset;
        const localStart = canonicalLocalTime(totalSeconds);
        const resolved = resolveCivilDateTime({
          timezone: schedule.timezone,
          civilDate,
          localTime: localStart,
        });
        if (!resolved) continue;
        const startsAt = resolved.instant;
        const endsAt = new Date(
          Date.parse(startsAt) + schedule.slotDurationMinutes * MS_PER_MINUTE,
        ).toISOString();
        const identity = `${startsAt}|${schedule.timezone}|${civilDate}|${localStart}`;
        slots.set(identity, {
          startsAt,
          endsAt,
          timezone: schedule.timezone,
          civilDate,
          localStart,
          identity,
          ...(schedule.facilityId === undefined ? {} : { facilityId: schedule.facilityId }),
          ...(schedule.doctorId === undefined ? {} : { doctorId: schedule.doctorId }),
        });
      }
    }
  }

  return [...slots.values()].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

export const expandWeeklySlots = expandWeeklyRecurrence;

export type {
  CivilDateTimeInput,
  IsoWeekday,
  LocalWindow,
  RecurrenceSlot,
  ResolvedCivilDateTime,
  WeeklyRecurrence,
} from './types.js';
