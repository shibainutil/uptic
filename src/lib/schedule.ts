import { type Routine, type RoutineExecution, type RoutineSchedule, type ExerciseExecution, effectiveExerciseIds } from '../types/gym';

// Whether the user has actually engaged with this exercise at all — a running/paused
// cardio timer, any weight/reps typed into a set, or an explicit skip. Only exercises
// with NO trace of engagement get auto-skipped when their routine execution goes past
// due; anything the user has touched (even mid-workout, timer still running) must be
// left alone instead of being force-skipped out from under them.
function hasAnyEngagement(e: ExerciseExecution): boolean {
  return Boolean(
    e.completed ||
    e.skipped ||
    e.timerStartedAt ||
    (e.durationMin != null && e.durationMin > 0) ||
    e.setData?.some((s) => s.weight != null || s.reps != null || s.skipped),
  );
}

// ── ISO date helpers (local, no time component) ─────────────────────────────

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Inclusive day difference a - b in whole days. */
export function diffDays(aISO: string, bISO: string): number {
  const a = fromISO(aISO).getTime();
  const b = fromISO(bISO).getTime();
  return Math.round((a - b) / 86_400_000);
}

const MAX_LOOKBACK_DAYS = 180;

/**
 * Returns every due date (ISO) for a schedule from startISO through untilISO inclusive.
 * Look-back is capped to the trailing MAX_LOOKBACK_DAYS to bound generation.
 */
export function enumerateDueDates(schedule: RoutineSchedule, startISO: string, untilISO: string): string[] {
  const cap = addDays(untilISO, -MAX_LOOKBACK_DAYS);
  let cursor = diffDays(startISO, cap) > 0 ? startISO : cap;
  const out: string[] = [];
  let guard = 0;
  while (diffDays(cursor, untilISO) <= 0 && guard++ < 1000) {
    const d = fromISO(cursor);
    if (isDue(schedule, d)) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

function isDue(schedule: RoutineSchedule, d: Date): boolean {
  switch (schedule.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return (schedule.daysOfWeek ?? []).includes(d.getDay());
    case 'monthly':
      return schedule.dayOfMonth != null && d.getDate() === schedule.dayOfMonth;
    default:
      return false;
  }
}

export interface ReconcileResult {
  toCreate: RoutineExecution[];
  toFail: string[]; // routine execution ids to mark failed
  exerciseExecsToSkip: string[]; // existing exercise execution ids to mark skipped
  exerciseExecsToCreateSkipped: ExerciseExecution[]; // stub docs for exercises never logged
}

// Executions are materialized through the end of next week (Mon–Sun), so the whole of
// next week is already visible/schedulable instead of only appearing day by day.
function endOfNextWeek(todayISO: string): string {
  const mondayOffset = (fromISO(todayISO).getDay() + 6) % 7; // 0=Mon..6=Sun
  const thisMonday = addDays(todayISO, -mondayOffset);
  return addDays(thisMonday, 13); // +7 -> next Monday, +6 -> next Sunday
}

/**
 * Computes missing pending executions to create, overdue pending executions to fail,
 * and exercise executions to mark skipped when their parent routine execution fails.
 * Pure — callers persist the result. Routine executions are never auto-deleted here;
 * deletion only ever happens via explicit user action (manual delete / reschedule).
 */
export function reconcileRoutineExecutions(
  routines: Routine[],
  existing: RoutineExecution[],
  exerciseExecutions: ExerciseExecution[],
  today: string,
): ReconcileResult {
  const existingIds = new Set(existing.map((e) => e.id));
  const now = new Date().toISOString();
  const toCreate: RoutineExecution[] = [];
  const horizon = endOfNextWeek(today);

  for (const routine of routines) {
    const dueDates = enumerateDueDates(routine.schedule, routine.startDate, horizon);
    for (const dueDate of dueDates) {
      const id = `${routine.id}_${dueDate}`;
      if (existingIds.has(id)) continue;
      toCreate.push({ id, routineId: routine.id, dueDate, status: 'pending', createdAt: now });
    }
  }

  const routineById = new Map(routines.map((r) => [r.id, r]));
  const toFail: string[] = [];
  for (const exec of existing) {
    if (exec.status !== 'pending' || exec.rescheduledTo || exec.deleted) continue;
    if (diffDays(today, exec.dueDate) > 0) toFail.push(exec.id);
  }

  const exerciseExecsToSkip: string[] = [];
  const exerciseExecsToCreateSkipped: ExerciseExecution[] = [];
  for (const routineExecId of toFail) {
    const exec = existing.find((e) => e.id === routineExecId)!;
    const routine = routineById.get(exec.routineId);
    if (!routine) continue;
    for (const exerciseId of effectiveExerciseIds(routine, exec)) {
      const existingExecExec = exerciseExecutions.find(
        (e) => e.routineExecutionId === routineExecId && e.exerciseId === exerciseId,
      );
      if (existingExecExec) {
        // Only auto-skip exercises with zero trace of engagement — anything the user has
        // actually started (even mid-workout, e.g. a cardio timer still running) must be
        // left alone rather than force-skipped just because a day boundary passed.
        if (!hasAnyEngagement(existingExecExec)) exerciseExecsToSkip.push(existingExecExec.id);
      } else {
        exerciseExecsToCreateSkipped.push({
          id: `${routineExecId}_${exerciseId}`,
          exerciseId,
          date: exec.dueDate,
          routineExecutionId: routineExecId,
          paramValues: [],
          completed: false,
          skipped: true,
          createdAt: now,
        });
      }
    }
  }

  return { toCreate, toFail, exerciseExecsToSkip, exerciseExecsToCreateSkipped };
}

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Human-readable schedule summary, e.g. "Weekly · Tue, Thu" or "Monthly · 15th". */
export function describeSchedule(schedule: RoutineSchedule): string {
  switch (schedule.frequency) {
    case 'daily':
      return 'Daily';
    case 'weekly': {
      const days = (schedule.daysOfWeek ?? []).slice().sort((a, b) => a - b).map((d) => WEEKDAY_ABBR[d]);
      return days.length ? `Weekly · ${days.join(', ')}` : 'Weekly';
    }
    case 'monthly':
      return schedule.dayOfMonth != null ? `Monthly · ${ordinal(schedule.dayOfMonth)}` : 'Monthly';
    default:
      return '';
  }
}
