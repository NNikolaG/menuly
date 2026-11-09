import { hasOpeningHours, openStatus, venueClock, weekdayNames } from './opening-hours';
import type { OpeningHours } from './venue';

const hours: OpeningHours = {
  mon: [['08:00', '23:00']],
  fri: [
    ['08:00', '15:00'],
    ['17:00', '01:00'],
  ],
  sat: [['10:00', '22:00']],
};

// 2026-11-06 is a Friday; Belgrade is UTC+1 in November.
const at = (iso: string) => new Date(iso);

describe('opening hours', () => {
  it('reads the venue clock in its time zone', () => {
    expect(venueClock(at('2026-11-06T23:30:00Z'), 'Europe/Belgrade')).toEqual({
      day: 'sat',
      minute: 30,
    });
  });

  it('is open inside an interval', () => {
    expect(openStatus(hours, 'Europe/Belgrade', at('2026-11-06T09:00:00Z'))).toEqual({
      open: true,
      until: '15:00',
    });
  });

  it('is closed between two intervals and opens again the same day', () => {
    expect(openStatus(hours, 'Europe/Belgrade', at('2026-11-06T15:00:00Z'))).toEqual({
      open: false,
      next: { day: 'fri', time: '17:00', today: true },
    });
  });

  it('counts an interval past midnight on the next day', () => {
    expect(openStatus(hours, 'Europe/Belgrade', at('2026-11-06T23:30:00Z'))).toEqual({
      open: true,
      until: '01:00',
    });
    expect(openStatus(hours, 'Europe/Belgrade', at('2026-11-07T00:30:00Z'))).toEqual({
      open: false,
      next: { day: 'sat', time: '10:00', today: true },
    });
  });

  it('finds the next opening days ahead', () => {
    // Sunday noon: closed, next is Monday.
    expect(openStatus(hours, 'Europe/Belgrade', at('2026-11-08T11:00:00Z'))).toEqual({
      open: false,
      next: { day: 'mon', time: '08:00', today: false },
    });
  });

  it('knows when no hours are set', () => {
    expect(hasOpeningHours({})).toBe(false);
    expect(hasOpeningHours({ mon: [] })).toBe(false);
    expect(hasOpeningHours(undefined)).toBe(false);
    expect(hasOpeningHours(hours)).toBe(true);
  });

  it('names weekdays Monday first', () => {
    const names = weekdayNames('en');
    expect(names.mon).toBe('Monday');
    expect(names.sun).toBe('Sunday');
  });
});
