export type ScheduleUnit = 'day' | 'week' | 'month';

export interface CleaningSchedule {
  unit: ScheduleUnit;
  interval: number;         // every N units; 1 = plain daily/weekly/monthly
  daysOfWeek?: number[];    // unit='week': 0=Sun..6=Sat
  dayOfMonth?: number;      // unit='month': 1..31
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

export type CleaningSessionStatus = 'pending' | 'completed' | 'failed';

export interface CleaningSession {
  id: string;                        // periodic: `${taskId}_${variant}_${dueDate}`; finite: `${taskId}_${index}`
  taskId: string;
  variant?: 'normal' | 'deep';       // periodic only
  dueDate: string;                   // ISO yyyy-mm-dd
  status: CleaningSessionStatus;
  completedAt?: string;
  createdAt: string;
  rescheduledTo?: string;            // tombstone; keeps doc alive so the reconciler won't recreate it
  deleted?: boolean;                 // user hard-deleted this occurrence; tombstone, hidden everywhere
  notes?: string;
}
