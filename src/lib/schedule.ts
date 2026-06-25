import type { Routine, RoutineExecution, RoutineSchedule } from '../types/gym';

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
  toFail: string[]; // execution ids to mark failed
}

/**
 * Computes missing pending executions to create and overdue pending executions to fail.
 * Pure — callers persist the result.
 */
export function reconcileRoutineExecutions(
  routines: Routine[],
  existing: RoutineExecution[],
  today: string,
): ReconcileResult {
  const existingIds = new Set(existing.map((e) => e.id));
  const now = new Date().toISOString();
  const toCreate: RoutineExecution[] = [];

  for (const routine of routines) {
    const dueDates = enumerateDueDates(routine.schedule, routine.startDate, today);
    const grace = routine.graceDays ?? 0;
    for (const dueDate of dueDates) {
      const id = `${routine.id}_${dueDate}`;
      if (existingIds.has(id)) continue;
      // Skip dates past the grace window — they can no longer be completed and
      // we must not recreate executions the user intentionally deleted.
      if (diffDays(today, dueDate) > grace) continue;
      toCreate.push({ id, routineId: routine.id, dueDate, status: 'pending', createdAt: now });
    }
  }

  const graceByRoutine = new Map(routines.map((r) => [r.id, r.graceDays]));
  const toFail: string[] = [];
  for (const exec of existing) {
    if (exec.status !== 'pending') continue;
    const grace = graceByRoutine.get(exec.routineId) ?? 0;
    if (diffDays(today, exec.dueDate) > grace) toFail.push(exec.id);
  }

  return { toCreate, toFail };
}

/** Whether a pending execution due on dueDate can still be completed today. */
export function withinGrace(dueDate: string, graceDays: number, today: string): boolean {
  const delta = diffDays(today, dueDate);
  return delta >= 0 && delta <= graceDays;
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
