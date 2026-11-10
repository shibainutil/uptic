export type ScheduleUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface HabitSchedule {
  unit: ScheduleUnit;
  interval: number;         // every N units; 1 = plain daily/weekly/monthly/quarterly/yearly
  daysOfWeek?: number[];    // unit='week': 0=Sun..6=Sat
  dayOfMonth?: number;      // unit='month'|'quarter'|'year': 1..31
  timesOfDay: string[];     // "HH:MM" 24h, one entry per occurrence per due date (e.g. morning + evening)
}

export type HabitKind = 'continuous' | 'limited';

export interface Habit {
  id: string;
  name: string;
  description?: string;
  kind: HabitKind;
  goalId?: string;               // the goal this habit serves (Core Concept: every habit should have one)
  startDate: string;             // ISO yyyy-mm-dd; schedule anchor
  schedule: HabitSchedule;

  // limited only — completion condition(s); the habit is done once either is met
  targetSessions?: number;
  targetDate?: string;           // ISO yyyy-mm-dd

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
