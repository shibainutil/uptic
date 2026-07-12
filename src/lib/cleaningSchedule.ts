import { toISO, fromISO, addDays, diffDays } from './schedule';
import type { CleaningSchedule } from '../types/cleaning';

// ── Periodic due-date logic ──────────────────────────────────────────────────

function mondayOf(iso: string): string {
  const offset = (fromISO(iso).getDay() + 6) % 7; // 0=Mon..6=Sun
  return addDays(iso, -offset);
}

export function isDuePeriodic(schedule: CleaningSchedule, d: Date, startISO: string): boolean {
  const iso = toISO(d);
  const interval = schedule.interval || 1;
  switch (schedule.unit) {
    case 'day': {
      const offset = diffDays(iso, startISO);
      return offset >= 0 && offset % interval === 0;
    }
    case 'week': {
      if (!(schedule.daysOfWeek ?? []).includes(d.getDay())) return false;
      const weekOffset = diffDays(mondayOf(iso), mondayOf(startISO)) / 7;
      return weekOffset >= 0 && Number.isInteger(weekOffset) && weekOffset % interval === 0;
    }
    case 'month': {
      if (schedule.dayOfMonth == null || d.getDate() !== schedule.dayOfMonth) return false;
      const start = fromISO(startISO);
      const monthOffset = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth());
      return monthOffset >= 0 && monthOffset % interval === 0;
    }
    default:
      return false;
  }
}

const MAX_LOOKBACK_DAYS = 180;

/** Every due date (ISO) for a periodic schedule from startISO through untilISO inclusive. */
export function enumeratePeriodicDueDates(schedule: CleaningSchedule, startISO: string, untilISO: string): string[] {
  const cap = addDays(untilISO, -MAX_LOOKBACK_DAYS);
  let cursor = diffDays(startISO, cap) > 0 ? startISO : cap;
  const out: string[] = [];
  let guard = 0;
  while (diffDays(cursor, untilISO) <= 0 && guard++ < 1000) {
    if (isDuePeriodic(schedule, fromISO(cursor), startISO)) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/**
 * How many (date × time-of-day) occurrences this schedule has produced from its
 * start date through the day before `beforeISO` (inclusive). Used to size the
 * "scheduled before today" denominator for a progress bar — logging itself is
 * freeform, so this is just a count of what was nominally due, not a set of
 * slots that get consumed.
 */
export function countScheduledSlotsBefore(schedule: CleaningSchedule, startISO: string, beforeISO: string): number {
  const dueDates = enumeratePeriodicDueDates(schedule, startISO, addDays(beforeISO, -1));
  return dueDates.length * Math.max(1, schedule.timesOfDay.length);
}

// ── Human-readable description ───────────────────────────────────────────────

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** e.g. "Daily at 08:00, 20:00", "Weekly · Mon, Wed at 18:00", "Every 3 months · 1st at 09:00". */
export function describeCleaningSchedule(schedule: CleaningSchedule): string {
  const n = schedule.interval || 1;
  let base: string;
  switch (schedule.unit) {
    case 'day':
      base = n === 1 ? 'Daily' : `Every ${n} days`;
      break;
    case 'week': {
      const days = (schedule.daysOfWeek ?? []).slice().sort((a, b) => a - b).map((d) => WEEKDAY_ABBR[d]);
      const prefix = n === 1 ? 'Weekly' : `Every ${n} weeks`;
      base = days.length ? `${prefix} · ${days.join(', ')}` : prefix;
      break;
    }
    case 'month': {
      const prefix = n === 1 ? 'Monthly' : `Every ${n} months`;
      base = schedule.dayOfMonth != null ? `${prefix} · ${ordinal(schedule.dayOfMonth)}` : prefix;
      break;
    }
    default:
      base = '';
  }
  const times = schedule.timesOfDay.length ? ` at ${schedule.timesOfDay.join(', ')}` : '';
  return `${base}${times}`;
}
