import { create } from 'zustand';
import type { Habit } from '../types/habits';

/** A scheduled session waiting for the user to enter its metric values. */
export interface MetricPrompt {
  habit: Habit;
  /** When the session is logged at (ISO datetime) — the slot's scheduled time. */
  loggedAt: string;
}

/**
 * Marking a metric habit's session "Done" needs numbers, so instead of logging straight
 * away `habitSlotActions.markDone` opens this prompt; `MetricLogHost` (mounted once in
 * the root layout) shows the modal and saves the entry.
 */
export const useMetricPromptStore = create<{
  prompt: MetricPrompt | null;
  open: (p: MetricPrompt) => void;
  close: () => void;
}>((set) => ({
  prompt: null,
  open: (prompt) => set({ prompt }),
  close: () => set({ prompt: null }),
}));
