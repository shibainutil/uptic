import { fromISO } from './schedule';
import { endPauseFrom, type SessionSlot } from './habitSchedule';
import type { Habit, HabitLogEntry, HabitPause } from '../types/habits';

interface Deps {
  today: string;
  habits: Habit[];
  entries: HabitLogEntry[];
  setPauses: (habitId: string, pauses: HabitPause[]) => Promise<unknown>;
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
export function habitSlotActions({ today, habits, entries, setPauses, add, update, remove, setSkipped, onError }: Deps) {
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

    /** Undo a paused slot: end the pause from that day on, so it doesn't resume later. */
    undoPause(habitId: string, slot: SessionSlot) {
      const habit = habits.find((h) => h.id === habitId);
      if (habit) guard(setPauses(habitId, endPauseFrom(habit, slot.date)));
    },

    /** Take back a Done: remove (or decrement) the entry that fills this slot. */
    undoDone(habitId: string, slot: SessionSlot) {
      const match = entries.find((e) => e.id === slot.entryId && e.habitId === habitId);
      if (!match) return;
      const count = match.count ?? 1;
      guard(count > 1 ? update(match.id, { count: count - 1 }) : remove(match.id));
    },
  };
}
