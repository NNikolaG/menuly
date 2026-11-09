import { WEEKDAYS, type OpeningHours, type Weekday } from './venue';

/** Whether a venue is open at a moment, and when that changes. */
export type OpenStatus =
  | { open: true; until: string }
  | { open: false; next: { day: Weekday; time: string; today: boolean } | null };

export function hasOpeningHours(hours: OpeningHours | undefined | null): hours is OpeningHours {
  return !!hours && WEEKDAYS.some((day) => (hours[day]?.length ?? 0) > 0);
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Weekday and minutes since midnight of `now` in the venue's IANA `timeZone`. */
export function venueClock(now: Date, timeZone: string): { day: Weekday; minute: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    // Unknown zone: the guest's own clock is the best guess.
    parts = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  }
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = part('weekday').toLowerCase().slice(0, 3) as Weekday;
  return { day, minute: (Number(part('hour')) % 24) * 60 + Number(part('minute')) };
}

/**
 * Open or closed at `now`. An interval whose close is at or before its open runs past midnight,
 * so Friday `["17:00", "01:00"]` still counts at 00:30 on Saturday.
 */
export function openStatus(hours: OpeningHours, timeZone: string, now: Date): OpenStatus {
  const { day, minute } = venueClock(now, timeZone);
  const index = WEEKDAYS.indexOf(day);
  const yesterday = WEEKDAYS[(index + 6) % 7];

  for (const [from, to] of hours[yesterday] ?? []) {
    if (minutes(to) <= minutes(from) && minute < minutes(to)) return { open: true, until: to };
  }
  for (const [from, to] of hours[day] ?? []) {
    const start = minutes(from);
    const end = minutes(to);
    const overnight = end <= start;
    if (minute >= start && (overnight || minute < end)) return { open: true, until: to };
  }

  // Closed: the next opening today, or the first one of a following day.
  const later = (hours[day] ?? [])
    .map(([from]) => from)
    .filter((from) => minutes(from) > minute)
    .sort();
  if (later.length) return { open: false, next: { day, time: later[0], today: true } };
  for (let step = 1; step <= 7; step++) {
    const next = WEEKDAYS[(index + step) % 7];
    const opens = (hours[next] ?? []).map(([from]) => from).sort();
    if (opens.length) return { open: false, next: { day: next, time: opens[0], today: false } };
  }
  return { open: false, next: null };
}

/** Localized weekday names, Monday first (`Intl`, so they follow the build's locale). */
export function weekdayNames(locale: string): Record<Weekday, string> {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  // 2024-01-01 was a Monday.
  const names = WEEKDAYS.map((_, i) => format.format(Date.UTC(2024, 0, 1 + i)));
  return Object.fromEntries(
    WEEKDAYS.map((day, i) => [
      day,
      names[i].charAt(0).toLocaleUpperCase(locale) + names[i].slice(1),
    ]),
  ) as Record<Weekday, string>;
}
