import { addDays } from './schedule';
import { sessionSlots, type SessionSlot } from './habitSchedule';
import { isHabitComplete, totalSessions, type Habit, type HabitLogEntry } from '../types/habits';
import type { Project } from '../types/projects';
import type { Routine, RoutineExecStatus, RoutineExecution } from '../types/gym';

export type HomeItem =
  | {
    kind: 'task'; key: string; date: string; overdue: boolean; done: boolean;
    projectId: string; projectName: string; milestoneId: string; milestoneTitle: string; taskId: string; title: string;
  }
  | { kind: 'habit'; key: string; date: string; habitId: string; name: string; slot: SessionSlot }
  | { kind: 'routine'; key: string; date: string; execId: string; name: string; status: RoutineExecStatus };

interface Input {
  projects: Project[];
  habits: Habit[];
  entries: HabitLogEntry[];
  routines: Routine[];
  routineExecutions: RoutineExecution[];
}

/** Monday..Sunday of the week containing `iso` (the app's weeks start on Monday). */
export function weekRange(iso: string): [string, string] {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const monday = addDays(iso, -((d.getDay() + 6) % 7));
  return [monday, addDays(monday, 6)];
}

const KIND_ORDER = { habit: 0, routine: 1, task: 2 } as const;

/**
 * Everything due in [from, to], for the Home screen:
 * - tasks: a task has no date of its own, so it is due when its milestone is. Tasks of
 *   milestones due in the range (done ones too, ticked), plus still-open tasks of
 *   milestones that were due before `today` (overdue);
 * - habit sessions: the habit's scheduled sessions (done / skipped / missed / upcoming),
 *   paused days show their sessions as paused; never for habits that reached their session goal;
 * - fitness routines: routine occurrences due in the range.
 */
export function buildAgenda(input: Input, from: string, to: string, today: string): HomeItem[] {
  const items: HomeItem[] = [];

  for (const p of input.projects) {
    if (p.completedAt) continue;
    for (const m of p.milestones) {
      if (!m.dueDate) continue;
      const inRange = m.dueDate >= from && m.dueDate <= to;
      const overdueBefore = m.dueDate < from && m.dueDate < today;
      if (!inRange && !overdueBefore) continue;
      for (const c of m.criteria) {
        if (c.kind !== 'task') continue;
        const done = !!c.doneAt;
        if (overdueBefore && done) continue;
        items.push({
          kind: 'task', key: `t|${c.id}`, date: m.dueDate, overdue: !done && m.dueDate < today, done,
          projectId: p.id, projectName: p.name, milestoneId: m.id, milestoneTitle: m.title, taskId: c.id, title: c.title,
        });
      }
    }
  }

  for (const h of input.habits) {
    const mine = input.entries.filter((e) => e.habitId === h.id);
    if (isHabitComplete(h, totalSessions(mine), today)) continue;
    for (const slot of sessionSlots(h, input.entries, today, to)) {
      if (slot.date < from || slot.date > to) continue;
      items.push({ kind: 'habit', key: `h|${h.id}|${slot.key}`, date: slot.date, habitId: h.id, name: h.name, slot });
    }
  }

  for (const e of input.routineExecutions) {
    if (e.rescheduledTo || e.deleted || e.dueDate < from || e.dueDate > to) continue;
    const routine = input.routines.find((r) => r.id === e.routineId);
    items.push({ kind: 'routine', key: `r|${e.id}`, date: e.dueDate, execId: e.id, name: routine?.name ?? 'Deleted routine', status: e.status });
  }

  const time = (i: HomeItem) => (i.kind === 'habit' ? i.slot.time : '');
  const label = (i: HomeItem) => (i.kind === 'task' ? i.title : i.name);
  return items.sort((a, b) =>
    a.date.localeCompare(b.date)
    || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || time(a).localeCompare(time(b))
    || label(a).localeCompare(label(b)));
}

/** Whether an item counts toward the "x of y done" summary: paused sessions aren't expected. */
export function itemCounted(i: HomeItem): boolean {
  return !(i.kind === 'habit' && i.slot.status === 'paused');
}

/** Whether an item counts as finished, for the "x of y done" summary. */
export function itemDone(i: HomeItem): boolean {
  if (i.kind === 'task') return i.done;
  if (i.kind === 'habit') return i.slot.status === 'done' || i.slot.status === 'skipped';
  return i.status === 'completed';
}
