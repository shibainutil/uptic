import { useEffect } from 'react';
import { pendingLatches } from '../lib/projectProgress';
import { todayISO } from '../lib/schedule';
import type { Project } from '../types/projects';
import type { Habit, HabitLogEntry } from '../types/habits';

/**
 * Persists progress that should stick: a habit target is stamped `metAt` the
 * first time it's reached, and a project's `completedAt` follows "all
 * milestones met". Runs whenever projects, habits or log entries change.
 * Each write changes the snapshot so the next pass finds nothing to do.
 */
export function useProjectLatches(
  projects: Project[],
  habits: Habit[],
  entries: HabitLogEntry[],
  ready: boolean,
  apply: (projectId: string, data: Pick<Project, 'milestones' | 'completedAt'>) => Promise<void>,
) {
  useEffect(() => {
    if (!ready) return;
    const today = todayISO();
    for (const p of projects) {
      const latch = pendingLatches(p, habits, entries, today);
      if (latch) apply(p.id, latch).catch(() => { /* retried on the next snapshot */ });
    }
  }, [projects, habits, entries, ready, apply]);
}
