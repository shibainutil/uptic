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
    /** Log the slot as done: on its own date and time, or right now for today's. */
    markDone(habitId: string, slot: SessionSlot) {
      const [h, m] = slot.time.split(':').map(Number);
      const at = slot.date === today ? new Date() : (() => { const d = fromISO(slot.date); d.setHours(h, m, 0, 0); return d; })();
      guard(add({ habitId, loggedAt: at.toISOString(), count: 1 }));
    },

    /** Skip (or un-skip) the slot's date; a session goal's last session moves later. */
    skip(habitId: string, slot: SessionSlot, value: boolean) {
      guard(setSkipped(habitId, slot.date, value));
    },

    /** Take back a Done: remove the latest session logged that day (or one off its count). */
    undoDone(habitId: string, slot: SessionSlot) {
      const latest = entries
        .filter((e) => e.habitId === habitId && toISO(new Date(e.loggedAt)) === slot.date)
        .sort((x, y) => y.loggedAt.localeCompare(x.loggedAt))[0];
      if (!latest) return;
      const count = latest.count ?? 1;
      guard(count > 1 ? update(latest.id, { count: count - 1 }) : remove(latest.id));
    },
  };
}
