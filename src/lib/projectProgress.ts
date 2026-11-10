import { addDays, diffDays } from './schedule';
import { habitWindowCounts } from './habitSchedule';
import type { Habit, HabitLogEntry } from '../types/habits';
import type { Criterion, HabitCriterion, Milestone, Project } from '../types/projects';

export interface HabitTargetProgress {
  rate: number;          // 0..1 over the trailing window
  completed: number;
  expected: number;
  /** The habit has existed for the whole window, so the rate means something. */
  covered: boolean;
  /** Days until the window is fully covered by the habit's history (0 when covered). */
  daysUntilCovered: number;
  /** Reaches the target right now (ignores the latch). */
  reachedNow: boolean;
  /** Met: latched earlier, or reached now. */
  met: boolean;
  habit?: Habit;
}

/**
 * A habit target is reached when, over the last `windowWeeks` weeks, at least
 * `targetRate` % of the habit's scheduled sessions were logged — and the habit
 * already existed for that whole window (no "100 % after 3 days").
 */
export function habitTargetProgress(
  c: HabitCriterion, habits: Habit[], entries: HabitLogEntry[], today: string,
): HabitTargetProgress {
  const habit = habits.find((h) => h.id === c.habitId);
  const windowStart = addDays(today, -(c.windowWeeks * 7 - 1));
  if (!habit) {
    return { rate: 0, completed: 0, expected: 0, covered: false, daysUntilCovered: 0, reachedNow: false, met: !!c.metAt };
  }
  const { completed, expected } = habitWindowCounts(habit, entries, windowStart, today);
  const rate = expected > 0 ? completed / expected : 0;
  const covered = habit.startDate <= windowStart;
  const daysUntilCovered = covered ? 0 : diffDays(habit.startDate, windowStart);
  const reachedNow = covered && expected > 0 && rate * 100 >= c.targetRate;
  return { rate, completed, expected, covered, daysUntilCovered, reachedNow, met: !!c.metAt || reachedNow, habit };
}

export function criterionMet(c: Criterion, habits: Habit[], entries: HabitLogEntry[], today: string): boolean {
  return c.kind === 'task' ? !!c.doneAt : habitTargetProgress(c, habits, entries, today).met;
}

export function milestoneMet(m: Milestone, habits: Habit[], entries: HabitLogEntry[], today: string): boolean {
  return m.criteria.length > 0 && m.criteria.every((c) => criterionMet(c, habits, entries, today));
}

export type ProjectStatus = 'active' | 'overdue' | 'done';

export interface ProjectProgress {
  status: ProjectStatus;
  met: number;           // milestones met
  total: number;
  /** First milestone (in order) that isn't met yet. */
  next?: Milestone;
  /** All milestones met right now (drives the completedAt latch). */
  allMet: boolean;
}

export function projectProgress(p: Project, habits: Habit[], entries: HabitLogEntry[], today: string): ProjectProgress {
  const metFlags = p.milestones.map((m) => milestoneMet(m, habits, entries, today));
  const met = metFlags.filter(Boolean).length;
  const total = p.milestones.length;
  const allMet = total > 0 && met === total;
  const done = total > 0 ? allMet : !!p.completedAt;
  const next = p.milestones.find((_, i) => !metFlags[i]);
  const status: ProjectStatus = done ? 'done' : p.deadline && today > p.deadline ? 'overdue' : 'active';
  return { status, met, total, next, allMet };
}

/**
 * Latches to persist: habit targets reached now but not yet stamped, and the
 * project's completedAt following "all milestones met". Returns null when
 * nothing changed, else the updated milestones/completedAt to write.
 */
export function pendingLatches(
  p: Project, habits: Habit[], entries: HabitLogEntry[], today: string,
): Pick<Project, 'milestones' | 'completedAt'> | null {
  let changed = false;
  const milestones = p.milestones.map((m) => ({
    ...m,
    criteria: m.criteria.map((c) => {
      if (c.kind !== 'habit' || c.metAt) return c;
      if (!habitTargetProgress(c, habits, entries, today).reachedNow) return c;
      changed = true;
      return { ...c, metAt: today };
    }),
  }));
  if (p.milestones.length > 0) {
    const allMet = milestones.every((m) => milestoneMet(m, habits, entries, today));
    if (allMet && !p.completedAt) { changed = true; return { milestones, completedAt: today }; }
    if (!allMet && p.completedAt) { changed = true; return { milestones, completedAt: undefined }; }
  }
  return changed ? { milestones, completedAt: p.completedAt } : null;
}
