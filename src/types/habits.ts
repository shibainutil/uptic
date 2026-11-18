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
 * Paused days aren't scheduled and aren't expected, so nothing counts against
 * the habit; a session goal simply finishes later.
 */
export interface HabitPause {
  from: string;
  until?: string;
}

export type HabitKind = 'continuous' | 'limited';

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
