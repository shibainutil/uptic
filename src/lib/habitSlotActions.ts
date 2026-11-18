import { fromISO, toISO } from './schedule';
import type { SessionSlot } from './habitSchedule';
import type { HabitLogEntry } from '../types/habits';

interface Deps {
  today: string;
  entries: HabitLogEntry[];
  add: (data: Omit<HabitLogEntry, 'id' | 'createdAt'>) => Promise<unknown> | unknown;
  update: (id: string, data: Partial<HabitLogEntry>) => Promise<unknown> | unknown;
  remove: (id: string) => Promise<unknown> | unknown;
  setSkipped: (habitId: string, date: string, skipped: boolean) => Promise<unknown>;
  onError: (e: unknown) => void;
}

/**
 * What the Done / Skip / Undo buttons on a scheduled habit session do. Shared by the
 * habit's sessions screen and the Home screen so they can't drift apart.
 */
export function habitSlotActions({ today, entries, add, update, remove, setSkipped, onError }: Deps) {
  const guard = (task: Promise<unknown> | unknown) => { Promise.resolve(task).catch(onError); };

  return {
    /** Log the slot as done at its scheduled time (createdAt records the real wall-clock moment). */
    markDone(habitId: string, slot: SessionSlot) {
      const [h, m] = slot.time.split(':').map(Number);
      const at = fromISO(slot.date);
      at.setHours(h, m, 0, 0);
      guard(add({ habitId, loggedAt: at.toISOString(), count: 1 }));
    },

    /** Skip (or un-skip) the slot by its key so multi-session days can be controlled separately. */
    skip(habitId: string, slot: SessionSlot, value: boolean) {
      guard(setSkipped(habitId, slot.key, value));
    },

    /** Take back a Done: remove the entry logged at this slot's exact time. */
    undoDone(habitId: string, slot: SessionSlot) {
      const [h, m] = slot.time.split(':').map(Number);
      const match = entries
        .filter((e) => {
          if (e.habitId !== habitId || toISO(new Date(e.loggedAt)) !== slot.date) return false;
          const d = new Date(e.loggedAt);
          return d.getHours() === h && d.getMinutes() === m;
        })
        .sort((x, y) => y.loggedAt.localeCompare(x.loggedAt))[0];
      if (!match) return;
      const count = match.count ?? 1;
      guard(count > 1 ? update(match.id, { count: count - 1 }) : remove(match.id));
    },
  };
}
