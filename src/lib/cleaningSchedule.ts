import { toISO, fromISO, addDays, diffDays } from './schedule';
import type { CleaningSchedule, CleaningTask, CleaningSession } from '../types/cleaning';

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

// ── Finite due-date logic ────────────────────────────────────────────────────

/** targetSessions dates evenly spaced across [startISO, targetISO], last one clamped to targetISO. */
export function computeFiniteDueDates(startISO: string, targetISO: string, targetSessions: number): string[] {
  if (targetSessions <= 0) return [];
  if (targetSessions === 1) return [targetISO];
  const span = Math.max(diffDays(targetISO, startISO), 0);
  const dates: string[] = [];
  for (let i = 0; i < targetSessions; i++) {
    if (i === targetSessions - 1) {
      dates.push(targetISO);
    } else {
      dates.push(addDays(startISO, Math.round((span * i) / (targetSessions - 1))));
    }
  }
  return dates;
}

// ── Human-readable description ───────────────────────────────────────────────

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** e.g. "Daily", "Every 3 days", "Weekly · Mon, Wed", "Every 2 weeks · Tue", "Monthly · 15th". */
export function describeCleaningSchedule(schedule: CleaningSchedule): string {
  const n = schedule.interval || 1;
  switch (schedule.unit) {
    case 'day':
      return n === 1 ? 'Daily' : `Every ${n} days`;
    case 'week': {
      const days = (schedule.daysOfWeek ?? []).slice().sort((a, b) => a - b).map((d) => WEEKDAY_ABBR[d]);
      const prefix = n === 1 ? 'Weekly' : `Every ${n} weeks`;
      return days.length ? `${prefix} · ${days.join(', ')}` : prefix;
    }
    case 'month': {
      const prefix = n === 1 ? 'Monthly' : `Every ${n} months`;
      return schedule.dayOfMonth != null ? `${prefix} · ${ordinal(schedule.dayOfMonth)}` : prefix;
    }
    default:
      return '';
  }
}

// ── Reconciliation ───────────────────────────────────────────────────────────

export interface CleaningReconcileResult {
  toCreate: CleaningSession[];
  toFail: string[]; // session ids to mark failed
}

// Sessions are materialized through the end of next week (Mon–Sun), matching the
// gym routine reconciler, so the whole of next week is already visible/schedulable.
function endOfNextWeek(today: string): string {
  const mondayOffset = (fromISO(today).getDay() + 6) % 7;
  const thisMonday = addDays(today, -mondayOffset);
  return addDays(thisMonday, 13);
}

/**
 * Computes missing pending sessions to create and overdue pending sessions to fail.
 * Pure — callers persist the result. Sessions are never auto-deleted here; deletion
 * only ever happens via explicit user action.
 */
export function reconcileCleaningSessions(
  tasks: CleaningTask[],
  existing: CleaningSession[],
  today: string,
): CleaningReconcileResult {
  const existingIds = new Set(existing.map((e) => e.id));
  const now = new Date().toISOString();
  const toCreate: CleaningSession[] = [];
  const horizon = endOfNextWeek(today);

  for (const task of tasks) {
    if (task.kind === 'periodic') {
      const variants: Array<{ variant: 'normal' | 'deep'; schedule?: CleaningSchedule }> = [
        { variant: 'normal', schedule: task.normalSchedule },
        { variant: 'deep', schedule: task.deepSchedule },
      ];
      for (const { variant, schedule } of variants) {
        if (!schedule) continue;
        for (const dueDate of enumeratePeriodicDueDates(schedule, task.startDate, horizon)) {
          const id = `${task.id}_${variant}_${dueDate}`;
          if (existingIds.has(id)) continue;
          toCreate.push({ id, taskId: task.id, variant, dueDate, status: 'pending', createdAt: now });
        }
      }
    } else {
      // Finite: materialize all N sessions once, up front, the first time this task is reconciled.
      if (!task.targetDate || !task.targetSessions) continue;
      if (existing.some((e) => e.taskId === task.id)) continue;
      computeFiniteDueDates(task.startDate, task.targetDate, task.targetSessions).forEach((dueDate, i) => {
        const id = `${task.id}_${i}`;
        if (existingIds.has(id)) return;
        toCreate.push({ id, taskId: task.id, dueDate, status: 'pending', createdAt: now });
      });
    }
  }

  const toFail: string[] = [];
  for (const session of existing) {
    if (session.status !== 'pending' || session.rescheduledTo || session.deleted) continue;
    if (diffDays(today, session.dueDate) > 0) toFail.push(session.id);
  }

  return { toCreate, toFail };
}
