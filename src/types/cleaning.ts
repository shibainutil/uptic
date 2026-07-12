export type ScheduleUnit = 'day' | 'week' | 'month';

export interface CleaningSchedule {
  unit: ScheduleUnit;
  interval: number;         // every N units; 1 = plain daily/weekly/monthly
  daysOfWeek?: number[];    // unit='week': 0=Sun..6=Sat
  dayOfMonth?: number;      // unit='month': 1..31
  timesOfDay: string[];     // "HH:MM" 24h, one entry per occurrence per due date (e.g. morning + evening)
}

export type CleaningTaskKind = 'periodic' | 'finite';

export interface CleaningTask {
  id: string;
  name: string;
  description?: string;
  kind: CleaningTaskKind;
  startDate: string;                 // ISO yyyy-mm-dd; periodic recurrence anchor / finite pacing start

  // periodic only
  normalSchedule?: CleaningSchedule;
  deepSchedule?: CleaningSchedule;    // absent = no deep clean tracked for this task

  // finite only
  targetSessions?: number;
  targetDate?: string;               // ISO yyyy-mm-dd

  createdAt: string;
}

// A user-created record of an actual cleaning session. Logging is freeform — entries
// aren't tied to a specific pre-generated schedule slot, can be logged outside the
// schedule entirely, edited, or removed. Progress is derived by comparing entry counts
// against the schedule, not by consuming pre-created placeholder docs.
export interface CleaningLogEntry {
  id: string;
  taskId: string;
  variant?: 'normal' | 'deep';       // periodic only; absent for finite tasks
  loggedAt: string;                  // ISO datetime — when the session actually happened
  notes?: string;
  createdAt: string;
}
