/**
 * A SMART outcome inside one pillar. See Notion "Core Concept".
 *
 * - achievement: reached once, then done (finish line, usually a deadline).
 * - maintenance: never "done"; an ongoing state judged on a rolling window
 *   (e.g. ≥ 90 % success over the last 8 weeks).
 *
 * Progress is not computed yet: projects and goal-linked habits don't exist.
 * Achievement goals are marked achieved by hand for now; maintenance goals
 * only store their target until habits feed them a success rate.
 */
export type GoalMode = 'achievement' | 'maintenance';

export interface Goal {
  id: string;
  pillarId: string;
  name: string;
  description?: string;
  mode: GoalMode;

  // achievement only
  deadline?: string;      // ISO yyyy-mm-dd
  achievedAt?: string;    // ISO yyyy-mm-dd; set once reached

  // maintenance only
  targetRate?: number;    // percent of scheduled occurrences that must succeed, 1..100
  windowWeeks?: number;   // rolling window length in weeks

  order: number;          // display position within its pillar, ascending
  createdAt: string;
}

export type GoalInput = Omit<Goal, 'id' | 'createdAt' | 'order'>;

export const DEFAULT_TARGET_RATE = 90;
export const DEFAULT_WINDOW_WEEKS = 8;

export type GoalStatus = 'active' | 'overdue' | 'achieved' | 'ongoing';

export function goalStatus(goal: Goal, todayISO: string): GoalStatus {
  if (goal.mode === 'maintenance') return 'ongoing';
  if (goal.achievedAt) return 'achieved';
  if (goal.deadline && todayISO > goal.deadline) return 'overdue';
  return 'active';
}

/** One-line summary of what success means for this goal. */
export function describeGoalTarget(goal: Goal): string {
  if (goal.mode === 'maintenance') {
    const rate = goal.targetRate ?? DEFAULT_TARGET_RATE;
    const weeks = goal.windowWeeks ?? DEFAULT_WINDOW_WEEKS;
    return `≥ ${rate}% over the last ${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
  if (goal.achievedAt) return `Achieved ${formatDate(goal.achievedAt)}`;
  if (goal.deadline) return `By ${formatDate(goal.deadline)}`;
  return 'No deadline';
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
