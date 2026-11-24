export type ScheduleUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface HabitSchedule {
  unit: ScheduleUnit;
  interval: number;         // every N units; 1 = plain daily/weekly/monthly/quarterly/yearly
  daysOfWeek?: number[];    // unit='week': 0=Sun..6=Sat
  dayOfMonth?: number;      // unit='month'|'quarter'|'year': 1..31
  timesOfDay: string[];     // "HH:MM" 24h, one entry per occurrence per due date (e.g. morning + evening)
}

/**
 * A stretch where the habit is on hold (holiday, illness…). `from`..`until` are
 * inclusive ISO dates; no `until` means paused until the user resumes it.
 * Sessions on paused days stay on the schedule but are marked paused: they aren't
 * expected, so nothing counts against the habit; a session goal simply finishes later.
 */
export interface HabitPause {
  from: string;
  until?: string;
}

export type HabitKind = 'continuous' | 'limited';

/**
 * A number a habit records with every session (weight, resting heart rate, minutes…).
 * Values live on the log entry under `values[metric.id]`; the `id` is stable across
 * renames so existing entries and charts keep pointing at the right metric.
 */
export interface MetricDef {
  id: string;
  name: string;
  unit?: string;                 // display only, e.g. "kg", "bpm"
  decimals?: number;             // digits shown when displaying a value (default 1)
  /** Which way is "good": colours deltas green/red. 'neutral' = no judgement. */
  direction?: 'down' | 'up' | 'neutral';
}

export interface Habit {
  id: string;
  name: string;
  description?: string;
  kind: HabitKind;
  startDate: string;             // ISO yyyy-mm-dd; schedule anchor
  schedule: HabitSchedule;

  // limited only — completion condition(s); the habit is done once either is met
  targetSessions?: number;
  targetDate?: string;           // ISO yyyy-mm-dd

  /**
   * Scheduled dates (ISO yyyy-mm-dd) the user chose to skip. A skipped date isn't
   * expected (it doesn't hurt the success rate), and session-count targets push
   * their projected finish to later occurrences instead.
   */
  skippedDates?: string[];

  /**
   * Individual session slots (key = "yyyy-mm-dd|HH:MM") the user chose to skip.
   * Used when a habit has multiple sessions per day so each can be controlled separately.
   * Takes precedence over skippedDates for the same date.
   */
  skippedSlots?: string[];

  /**
   * When true, logging an entry (on or off the fixed schedule) re-anchors future due
   * dates to `lastLoggedDate + interval` instead of the fixed startDate anchor.
   * Good for "every N days/weeks/months" habits like plants or haircuts where you want
   * the schedule to shift naturally after each completion.
   * Default false — fixed-schedule habits (physio Mon/Wed/Fri) should leave this off.
   */
  flexibleSchedule?: boolean;

  /** Numbers recorded with each session. Absent/empty = a plain done-or-skipped habit. */
  metrics?: MetricDef[];

  /** Pauses, past (kept as history), current and scheduled; never overlapping. */
  pauses?: HabitPause[];

  /** When true the habit is hidden in the archived group. */
  archived?: boolean;

  createdAt: string;
}

// A user-created record of an actual habit session. Logging is freeform — entries
// aren't tied to a specific pre-generated schedule slot, can be logged outside the
// schedule entirely, edited, or removed. Progress rings are derived by comparing
// entry counts against the schedule, not by consuming pre-created placeholder docs.
export interface HabitLogEntry {
  id: string;
  habitId: string;
  loggedAt: string;              // ISO datetime — when the session actually happened
  count?: number;                // sessions this single entry represents (default 1); e.g. logging 6 at once
  values?: Record<string, number>; // metric id -> recorded value (only for habits with `metrics`)
  notes?: string;
  createdAt: string;
}

/** Sum of `count` (default 1) across a set of log entries. */
export function totalSessions(entries: HabitLogEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.count ?? 1), 0);
}

/**
 * True once a limited habit's completion condition has been met. When a target
 * session count is set, that count is the actual goal — the target date is just
 * an informational deadline and does NOT by itself mark the habit complete (a
 * passed deadline with sessions still missing means overdue, not done). The date
 * only decides completion when there's no session-count goal to check against.
 */
export function isHabitComplete(habit: Habit, completedCount: number, todayISO: string): boolean {
  if (habit.kind !== 'limited') return false;
  if (habit.targetSessions != null) return completedCount >= habit.targetSessions;
  if (habit.targetDate != null) return todayISO > habit.targetDate;
  return false;
}

export function hasMetrics(habit: Pick<Habit, 'metrics'> | undefined): boolean {
  return (habit?.metrics?.length ?? 0) > 0;
}

/** "72.4 kg" — a metric value formatted with its decimals and unit. */
export function formatMetricValue(metric: MetricDef, value: number): string {
  const text = value.toFixed(metric.decimals ?? 1);
  return metric.unit ? `${text} ${metric.unit}` : text;
}

/** Parses user input like "72,4" (comma or dot decimal); null when empty or not a number. */
export function parseMetricInput(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() === '' || !Number.isFinite(n) ? null : n;
}
