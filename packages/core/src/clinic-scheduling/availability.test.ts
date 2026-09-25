import { describe, expect, it } from 'vitest';

import {
  AvailabilityValidationError,
  deriveAvailability,
  qualifyAvailabilityFreshness,
  suggestReplacementSlots,
  validateAddedAvailabilityException,
  type AvailabilityException,
  type AvailabilitySchedule,
} from './availability.js';

const schedule: AvailabilitySchedule = {
  facilityId: '90000000-0000-4000-8000-000000000001',
  doctorId: '91000000-0000-4000-8000-000000000001',
  timezone: 'Africa/Cairo',
  validFrom: '2026-04-15',
  validTo: '2026-04-17',
  slotDurationMinutes: 30,
  windows: [
    { isoWeekday: 3, localStart: '09:00', localEnd: '10:00' },
    { isoWeekday: 4, localStart: '09:00', localEnd: '10:00' },
    { isoWeekday: 5, localStart: '09:00', localEnd: '10:00' },
  ],
};

const interval = (
  type: AvailabilityException['type'],
  startsAt: string,
  endsAt: string,
  extra: Partial<AvailabilityException> = {},
): AvailabilityException => ({ type, startsAt, endsAt, ...extra });

describe('Feature 009 pure availability policy', () => {
  it('derives base and added slots with the approved half-open boundaries', () => {
    const result = deriveAvailability({
      schedule,
      civilDate: '2026-04-15',
      exceptions: [interval('added', '2026-04-15T08:00:00.000Z', '2026-04-15T08:30:00.000Z')],
    });

    expect(
      result.slots.map(({ startsAt, endsAt, source }) => ({ startsAt, endsAt, source })),
    ).toEqual([
      { startsAt: '2026-04-15T07:00:00.000Z', endsAt: '2026-04-15T07:30:00.000Z', source: 'base' },
      { startsAt: '2026-04-15T07:30:00.000Z', endsAt: '2026-04-15T08:00:00.000Z', source: 'base' },
      { startsAt: '2026-04-15T08:00:00.000Z', endsAt: '2026-04-15T08:30:00.000Z', source: 'added' },
    ]);
    expect(result.slots[1]?.endsAt).toBe(result.slots[2]?.startsAt);
  });

  it('applies absence over blocked over added over base without duplicate effects', () => {
    const result = deriveAvailability({
      schedule,
      civilDate: '2026-04-15',
      exceptions: [
        interval('blocked', '2026-04-15T07:30:00.000Z', '2026-04-15T08:00:00.000Z'),
        interval('absence', '2026-04-15T07:30:00.000Z', '2026-04-15T08:00:00.000Z'),
      ],
    });

    expect(result.slots.map((slot) => slot.startsAt)).toEqual(['2026-04-15T07:00:00.000Z']);
  });

  it('applies a persisted later blocked interval over earlier added availability', () => {
    const result = deriveAvailability({
      schedule,
      civilDate: '2026-04-15',
      exceptions: [
        interval('added', '2026-04-15T08:00:00.000Z', '2026-04-15T08:30:00.000Z'),
        interval('blocked', '2026-04-15T08:00:00.000Z', '2026-04-15T08:30:00.000Z'),
      ],
    });

    expect(result.slots.some((slot) => slot.source === 'added')).toBe(false);
  });

  it('applies a persisted later absence interval over earlier added availability', () => {
    const result = deriveAvailability({
      schedule,
      civilDate: '2026-04-15',
      exceptions: [
        interval('added', '2026-04-15T08:00:00.000Z', '2026-04-15T08:30:00.000Z'),
        interval('absence', '2026-04-15T08:00:00.000Z', '2026-04-15T08:30:00.000Z'),
      ],
    });

    expect(result.slots.some((slot) => slot.source === 'added')).toBe(false);
  });

  it('rejects added overlap with base, added, or effective blocked/absence intervals', () => {
    const baseSlots = deriveAvailability({ schedule, civilDate: '2026-04-15' }).slots;
    const cases: readonly [string, AvailabilityException, AvailabilityException[]][] = [
      ['base', interval('added', '2026-04-15T07:15:00.000Z', '2026-04-15T07:45:00.000Z'), []],
      [
        'added',
        interval('added', '2026-04-15T08:15:00.000Z', '2026-04-15T08:45:00.000Z'),
        [interval('added', '2026-04-15T08:00:00.000Z', '2026-04-15T08:30:00.000Z')],
      ],
      [
        'blocked',
        interval('added', '2026-04-15T08:15:00.000Z', '2026-04-15T08:45:00.000Z'),
        [interval('blocked', '2026-04-15T08:00:00.000Z', '2026-04-15T08:30:00.000Z')],
      ],
      [
        'absence',
        interval('added', '2026-04-15T08:15:00.000Z', '2026-04-15T08:45:00.000Z'),
        [interval('absence', '2026-04-15T08:00:00.000Z', '2026-04-15T08:30:00.000Z')],
      ],
    ];

    for (const [reason, candidate, existing] of cases) {
      expect(() => validateAddedAvailabilityException(candidate, existing, baseSlots)).toThrow(
        AvailabilityValidationError,
      );
      try {
        validateAddedAvailabilityException(candidate, existing, baseSlots);
      } catch (error) {
        expect(error).toMatchObject({ code: `added-${reason}-overlap` });
      }
    }
  });

  it('allows boundary contact and rejects positive-duration ordinary same-type overlap without coalescing', () => {
    expect(
      deriveAvailability({
        schedule,
        civilDate: '2026-04-15',
        exceptions: [
          interval('blocked', '2026-04-15T10:00:00.000Z', '2026-04-15T10:30:00.000Z'),
          interval('blocked', '2026-04-15T10:30:00.000Z', '2026-04-15T11:00:00.000Z'),
        ],
      }).exceptions,
    ).toHaveLength(2);

    expect(() =>
      deriveAvailability({
        schedule,
        civilDate: '2026-04-15',
        exceptions: [
          interval('blocked', '2026-04-15T10:00:00.000Z', '2026-04-15T10:30:00.000Z'),
          interval('blocked', '2026-04-15T10:29:59.000Z', '2026-04-15T11:00:00.000Z'),
        ],
      }),
    ).toThrowError(/overlap/);
  });

  it('overlays only the current delay metadata and never creates, removes, or shifts slots', () => {
    const withoutDelay = deriveAvailability({ schedule, civilDate: '2026-04-15' });
    const withDelay = deriveAvailability({
      schedule,
      civilDate: '2026-04-15',
      exceptions: [
        interval('delay', '2026-04-15T00:00:00.000Z', '2026-04-16T00:00:00.000Z', {
          delayMinutes: 30,
          createdAt: '2026-04-15T08:00:00.000Z',
        }),
        interval('delay', '2026-04-15T00:00:00.000Z', '2026-04-16T00:00:00.000Z', {
          delayMinutes: 15,
          createdAt: '2026-04-15T07:00:00.000Z',
        }),
      ],
    });

    expect(withDelay.delayMinutes).toBe(30);
    expect(withDelay.slots.every((slot) => slot.delayMinutes === 30)).toBe(true);
    expect(withDelay.slots.map(({ startsAt, endsAt }) => [startsAt, endsAt])).toEqual(
      withoutDelay.slots.map(({ startsAt, endsAt }) => [startsAt, endsAt]),
    );
  });

  it('removes only occupied ranges and keeps half-open boundary contact available', () => {
    const result = deriveAvailability({
      schedule,
      civilDate: '2026-04-15',
      reservations: [{ startsAt: '2026-04-15T07:30:00.000Z', endsAt: '2026-04-15T08:00:00.000Z' }],
    });

    expect(result.slots.map((slot) => slot.startsAt)).toEqual(['2026-04-15T07:00:00.000Z']);

    const otherScope = deriveAvailability({
      schedule,
      civilDate: '2026-04-15',
      reservations: [
        {
          startsAt: '2026-04-15T07:00:00.000Z',
          endsAt: '2026-04-15T07:30:00.000Z',
          facilityId: '90000000-0000-4000-8000-000000000002',
          doctorId: '91000000-0000-4000-8000-000000000001',
        },
      ],
    });
    expect(otherScope.slots[0]?.startsAt).toBe('2026-04-15T07:00:00.000Z');
  });

  it('qualifies fresh, stale, and unknown data and never marks stale data confirmable', () => {
    const now = new Date('2026-04-15T08:00:00.000Z');
    expect(
      qualifyAvailabilityFreshness(
        {
          observedAt: '2026-04-15T07:00:00.000Z',
          freshUntil: '2026-04-15T09:00:00.000Z',
        },
        now,
      ),
    ).toBe('fresh');
    expect(
      qualifyAvailabilityFreshness(
        {
          observedAt: '2026-04-15T06:00:00.000Z',
          freshUntil: '2026-04-15T07:00:00.000Z',
        },
        now,
      ),
    ).toBe('stale');
    expect(qualifyAvailabilityFreshness(undefined, now)).toBe('unknown');
    expect(
      deriveAvailability({
        schedule,
        civilDate: '2026-04-15',
        now,
        freshness: {
          observedAt: '2026-04-15T06:00:00.000Z',
          freshUntil: '2026-04-15T07:00:00.000Z',
        },
      }).confirmable,
    ).toBe(false);
  });

  it('suggests earliest future, same-scope, unreserved slots without creating holds', () => {
    const input = {
      schedule: { ...schedule, validFrom: '2026-04-15', validTo: '2026-04-17' },
      fromDate: '2026-04-15',
      toDate: '2026-04-17',
      now: '2026-04-15T07:15:00.000Z',
      reservations: [{ startsAt: '2026-04-15T07:30:00.000Z', endsAt: '2026-04-15T08:00:00.000Z' }],
      freshness: { observedAt: '2026-04-15T07:00:00.000Z', freshUntil: '2026-04-15T09:00:00.000Z' },
      limit: 3,
    } as const;

    const first = suggestReplacementSlots(input);
    const second = suggestReplacementSlots(input);
    expect(first.map((slot) => slot.startsAt)).toEqual([
      '2026-04-16T07:00:00.000Z',
      '2026-04-16T07:30:00.000Z',
      '2026-04-17T07:00:00.000Z',
    ]);
    expect(first).toEqual(second);
    expect(
      first.every(
        (slot) => slot.facilityId === schedule.facilityId && slot.doctorId === schedule.doctorId,
      ),
    ).toBe(true);
    expect(first.every((slot) => slot.hold === false)).toBe(true);
  });
});
