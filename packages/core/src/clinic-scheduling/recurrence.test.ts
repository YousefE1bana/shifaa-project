import { describe, expect, it } from 'vitest';

import { expandWeeklyRecurrence, resolveCivilDateTime } from './recurrence.js';
import type { WeeklyRecurrence } from './types.js';

const berlin: WeeklyRecurrence = {
  timezone: 'Europe/Berlin',
  validFrom: '2026-01-15',
  validTo: '2026-01-15',
  slotDurationMinutes: 30,
  windows: [{ isoWeekday: 4, localStart: '09:00', localEnd: '10:00' }],
};

describe('clinic scheduling weekly civil-time recurrence', () => {
  it.each([
    [1, '2026-01-05'],
    [2, '2026-01-06'],
    [3, '2026-01-07'],
    [4, '2026-01-08'],
    [5, '2026-01-09'],
    [6, '2026-01-10'],
    [7, '2026-01-11'],
  ] as const)(
    'emits only the configured ISO weekday %s across a complete week',
    (weekday, date) => {
      const slots = expandWeeklyRecurrence({
        timezone: 'UTC',
        validFrom: '2026-01-05',
        validTo: '2026-01-11',
        slotDurationMinutes: 30,
        windows: [{ isoWeekday: weekday, localStart: '09:00', localEnd: '10:00' }],
      });

      expect(slots).toHaveLength(2);
      expect(slots.every((slot) => slot.civilDate === date)).toBe(true);
      expect(slots.map((slot) => slot.localStart)).toEqual(['09:00', '09:30']);
    },
  );

  it('expands only the matching ISO weekday and treats both validity dates as inclusive', () => {
    const slots = expandWeeklyRecurrence({
      ...berlin,
      validFrom: '2026-01-14',
      validTo: '2026-01-21',
      windows: [{ isoWeekday: 3, localStart: '09:00', localEnd: '10:00' }],
    });

    expect(slots.map((slot) => `${slot.civilDate}/${slot.localStart}`)).toEqual([
      '2026-01-14/09:00',
      '2026-01-14/09:30',
      '2026-01-21/09:00',
      '2026-01-21/09:30',
    ]);
  });

  it('uses half-open windows and never emits a partial slot at the end boundary', () => {
    const slots = expandWeeklyRecurrence({
      ...berlin,
      windows: [{ isoWeekday: 4, localStart: '09:00', localEnd: '10:15' }],
    });

    expect(slots.map((slot) => slot.localStart)).toEqual(['09:00', '09:30']);
    expect(slots.every((slot) => Date.parse(slot.endsAt) > Date.parse(slot.startsAt))).toBe(true);
  });

  it('omits a nonexistent local time at the spring DST transition', () => {
    expect(
      resolveCivilDateTime({
        timezone: 'Europe/Berlin',
        civilDate: '2026-03-29',
        localTime: '02:30',
      }),
    ).toBeNull();
  });

  it('resolves an ambiguous local time to exactly the earlier offset', () => {
    const resolved = resolveCivilDateTime({
      timezone: 'Europe/Berlin',
      civilDate: '2026-10-25',
      localTime: '02:30',
    });

    expect(resolved?.instant).toBe('2026-10-25T00:30:00.000Z');
    expect(resolved?.offsetMinutes).toBe(120);
  });

  it('retains stable UTC identity and civil context across repeated expansion', () => {
    const first = expandWeeklyRecurrence(berlin);
    const second = expandWeeklyRecurrence(berlin);

    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({
      timezone: 'Europe/Berlin',
      civilDate: '2026-01-15',
      localStart: '09:00',
      startsAt: '2026-01-15T08:00:00.000Z',
      endsAt: '2026-01-15T08:30:00.000Z',
    });
    expect(first[0]?.identity).toBe('2026-01-15T08:00:00.000Z|Europe/Berlin|2026-01-15|09:00');
  });

  it('does not duplicate the ambiguous local slot when expanding a fold date', () => {
    const slots = expandWeeklyRecurrence({
      timezone: 'Europe/Berlin',
      validFrom: '2026-10-25',
      validTo: '2026-10-25',
      slotDurationMinutes: 30,
      windows: [{ isoWeekday: 7, localStart: '02:00', localEnd: '03:00' }],
    });

    expect(slots).toHaveLength(2);
    expect(new Set(slots.map((slot) => slot.identity)).size).toBe(2);
    expect(slots.map((slot) => slot.startsAt)).toEqual([
      '2026-10-25T00:00:00.000Z',
      '2026-10-25T00:30:00.000Z',
    ]);
  });
});
