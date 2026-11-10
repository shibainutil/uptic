import { toISO, fromISO, addDays, diffDays } from './schedule';
import { totalSessions, type Habit, type HabitLogEntry, type HabitSchedule } from '../types/habits';
import {
  DEFAULT_TARGET_RATE, DEFAULT_WINDOW_WEEKS, type Goal, type MaintenanceProgress,
} from '../types/goals';

// ── Due-date logic ───────────────────────────────────────────────────────────

function mondayOf(iso: string): string {
  const offset = (fromISO(iso).getDay() + 6) % 7; // 0=Mon..6=Sun
  return addDays(iso, -offset);
}

// month/quarter/year are all "same day-of-month, every N months" — just with a
// different number of months per unit.
function monthsPerUnit(unit: HabitSchedule['unit']): number {
  switch (unit) {
    case 'quarter': return 3;
    case 'year': return 12;
    default: return 1;
  }
}

export function isDue(schedule: HabitSchedule, d: Date, startISO: string): boolean {
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
    case 'month':
    case 'quarter':
    case 'year': {
      if (schedule.dayOfMonth == null || d.getDate() !== schedule.dayOfMonth) return false;
      const start = fromISO(startISO);
      const monthOffset = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth());
      const span = interval * monthsPerUnit(schedule.unit);
      return monthOffset >= 0 && monthOffset % span === 0;
    }
    default:
      return false;
  }
}

const MAX_ITERATIONS = 20000; // ~54 years of daily iteration; generous for "all time" ranges

/** Every due date (ISO) for a schedule from max(startISO, fromISO) through untilISO inclusive. */
export function enumerateDueDates(schedule: HabitSchedule, startISO: string, fromISO_: string, untilISO: string): string[] {
  let cursor = diffDays(fromISO_, startISO) > 0 ? fromISO_ : startISO;
  const out: string[] = [];
  let guard = 0;
  while (diffDays(cursor, untilISO) <= 0 && guard++ < MAX_ITERATIONS) {
    if (isDue(schedule, fromISO(cursor), startISO)) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** How many (date × time-of-day) occurrences a schedule produces in [from, until]. */
export function countScheduledSlots(schedule: HabitSchedule, startISO: string, fromISO_: string, untilISO: string): number {
  if (diffDays(untilISO, fromISO_) < 0) return 0;
  const dueDates = enumerateDueDates(schedule, startISO, fromISO_, untilISO);
  return dueDates.length * Math.max(1, (schedule.timesOfDay ?? []).length);
}

// ── Human-readable description ───────────────────────────────────────────────

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const UNIT_LABEL: Record<HabitSchedule['unit'], [string, string]> = {
  day: ['Daily', 'days'],
  week: ['Weekly', 'weeks'],
  month: ['Monthly', 'months'],
  quarter: ['Quarterly', 'quarters'],
  year: ['Yearly', 'years'],
};

/** e.g. "Daily at 08:00", "Weekly · Mon, Wed at 18:00", "Every 2 quarters · 1st at 09:00". */
export function describeSchedule(schedule: HabitSchedule): string {
  const n = schedule.interval || 1;
  const [plainLabel, unitPlural] = UNIT_LABEL[schedule.unit];
  let base: string;
  if (schedule.unit === 'week') {
    const days = (schedule.daysOfWeek ?? []).slice().sort((a, b) => a - b).map((d) => WEEKDAY_ABBR[d]);
    const prefix = n === 1 ? plainLabel : `Every ${n} ${unitPlural}`;
    base = days.length ? `${prefix} · ${days.join(', ')}` : prefix;
  } else if (schedule.unit === 'day') {
    base = n === 1 ? plainLabel : `Every ${n} ${unitPlural}`;
  } else {
    const prefix = n === 1 ? plainLabel : `Every ${n} ${unitPlural}`;
    base = schedule.dayOfMonth != null ? `${prefix} · ${ordinal(schedule.dayOfMonth)}` : prefix;
  }
  const times = (schedule.timesOfDay ?? []).length ? ` at ${schedule.timesOfDay.join(', ')}` : '';
  return `${base}${times}`;
}

// ── Progress rings ───────────────────────────────────────────────────────────

export type RingPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'allTime';

/** Inclusive [start, end] ISO date bounds for the period containing `todayISO`. */
export function periodBounds(period: RingPeriod, todayISO: string): [string, string] {
  const d = fromISO(todayISO);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (period) {
    case 'day':
      return [todayISO, todayISO];
    case 'week': {
      const monday = mondayOf(todayISO);
      return [monday, addDays(monday, 6)];
    }
    case 'month': {
      const first = toISO(new Date(y, m, 1));
      const last = toISO(new Date(y, m + 1, 0));
      return [first, last];
    }
    case 'quarter': {
      const qStart = Math.floor(m / 3) * 3;
      const first = toISO(new Date(y, qStart, 1));
      const last = toISO(new Date(y, qStart + 3, 0));
      return [first, last];
    }
    case 'year': {
      return [toISO(new Date(y, 0, 1)), toISO(new Date(y, 11, 31))];
    }
    case 'allTime':
      return [todayISO, todayISO]; // caller substitutes habit.startDate as the real lower bound
  }
}

export interface RingResult {
  rate: number; // 0..1
  completed: number;
  expected: number;
}

/** Progress for one habit over one ring period, clamped to [habit.startDate, today]. */
export function computeRing(habit: Habit, entries: HabitLogEntry[], period: RingPeriod, todayISO: string): RingResult {
  const [periodStart, periodEndRaw] = period === 'allTime'
    ? [habit.startDate, todayISO]
    : periodBounds(period, todayISO);
  const start = periodStart < habit.startDate ? habit.startDate : periodStart;
  const end = periodEndRaw > todayISO ? todayISO : periodEndRaw;
  if (diffDays(end, start) < 0) return { rate: 0, completed: 0, expected: 0 };

  const expected = countScheduledSlots(habit.schedule, habit.startDate, start, end);
  const rangeEndExclusive = addDays(end, 1);
  const completed = totalSessions(entries.filter(
    (e) => e.habitId === habit.id && e.loggedAt >= start && e.loggedAt < rangeEndExclusive,
  ));

  const rate = expected > 0 ? Math.min(completed / expected, 1) : (completed > 0 ? 1 : 0);
  return { rate, completed, expected };
}

// ── Goal success rate ────────────────────────────────────────────────────────

/** Sessions completed vs. scheduled for one habit in [from, until], clamped to its start date and today. */
function habitWindowCounts(habit: Habit, entries: HabitLogEntry[], fromISO_: string, untilISO: string) {
  const start = fromISO_ < habit.startDate ? habit.startDate : fromISO_;
  if (diffDays(untilISO, start) < 0) return { completed: 0, expected: 0 };
  const expected = countScheduledSlots(habit.schedule, habit.startDate, start, untilISO);
  const endExclusive = addDays(untilISO, 1);
  const logged = totalSessions(entries.filter(
    (e) => e.habitId === habit.id && e.loggedAt >= start && e.loggedAt < endExclusive,
  ));
  // Extra sessions on one habit can't make up for another habit being skipped.
  return { completed: Math.min(logged, expected), expected };
}

/**
 * Rolling-window success rate of a maintenance goal: successful ÷ scheduled
 * occurrences across every habit linked to it, over the last `windowWeeks`
 * weeks up to and including today. Uses the same counting as the habit rings.
 */
export function computeMaintenanceProgress(
  goal: Goal, habits: Habit[], entries: HabitLogEntry[], todayISO: string,
): MaintenanceProgress {
  const weeks = goal.windowWeeks ?? DEFAULT_WINDOW_WEEKS;
  const target = (goal.targetRate ?? DEFAULT_TARGET_RATE) / 100;
  const windowStart = addDays(todayISO, -(weeks * 7 - 1));
  let completed = 0;
  let expected = 0;
  for (const habit of habits) {
    if (habit.goalId !== goal.id) continue;
    const c = habitWindowCounts(habit, entries, windowStart, todayISO);
    completed += c.completed;
    expected += c.expected;
  }
  if (expected === 0) return { health: 'noData', rate: 0, completed, expected, windowStart };
  const rate = completed / expected;
  return { health: rate >= target ? 'onTrack' : 'slipping', rate, completed, expected, windowStart };
}
