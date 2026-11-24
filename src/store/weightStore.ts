import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { useMemo, useCallback } from 'react';
import { db } from '../firebase';
import { useHabits, useHabitLogEntries, HABITS_COL, ENTRIES_COL } from './habitStore';
import {
  WEIGHT_METRIC_ID, weightEntryId, weightMetricOf, weighInLoggedAt, toWeightEntry,
} from '../lib/weightHabit';
import { toKg, fromKg, type WeightEntry, type WeightTarget, type WeightUnit } from '../types/weight';
import type { Habit, MetricDef } from '../types/habits';

// Weight is a habit with one metric (see lib/weightHabit). These hooks keep the old
// Weight-tab interface on top of it, so the tab and the Health Connect sync are unchanged.

function stripUndefined(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function useWeightHabit(userId: string | null | undefined) {
  const { habits, loaded, update } = useHabits(userId);
  const habit = habits.find((h) => h.system === 'weight');
  return { habit, habitsLoaded: loaded, updateHabit: update };
}

/** Replaces the weight metric (not the whole array) on the habit. */
function withWeightMetric(habit: Habit, patch: (m: MetricDef) => MetricDef): MetricDef[] {
  return (habit.metrics ?? []).map((m) => (m.id === WEIGHT_METRIC_ID ? patch(m) : m));
}

export function useWeightEntries(userId: string | null | undefined) {
  const { habit, habitsLoaded, updateHabit } = useWeightHabit(userId);
  const { entries: all, loaded: entriesLoaded } = useHabitLogEntries(userId);
  const metric = habit ? weightMetricOf(habit) : undefined;

  const raw = useMemo(
    () => (habit ? all.filter((e) => e.habitId === habit.id && e.values?.[WEIGHT_METRIC_ID] != null) : []),
    [all, habit],
  );
  const entries: WeightEntry[] = useMemo(
    () => (metric ? raw.map((e) => toWeightEntry(metric, e)) : []),
    [raw, metric],
  );

  // One entry per day: logging a day that already has an entry replaces its value.
  const upsert = useCallback(async (data: Omit<WeightEntry, 'id' | 'createdAt'>) => {
    if (!userId || !habit || !metric) throw new Error('The Weight habit is still being set up — try again in a moment.');
    const stored = toKg(data.value, data.unit);
    // The unit last used is how weight is shown from now on.
    if (metric.unit !== data.unit) {
      await updateHabit(habit.id, { metrics: withWeightMetric(habit, (m) => ({ ...m, unit: data.unit })) });
    }
    const existing = raw.find((e) => toWeightEntry(metric, e).date === data.date);
    const now = new Date();
    const docData = existing
      ? { ...existing, values: { ...existing.values, [WEIGHT_METRIC_ID]: stored }, notes: data.note }
      : {
          id: weightEntryId(data.date), habitId: habit.id, count: 1,
          loggedAt: weighInLoggedAt(data.date, now),
          values: { [WEIGHT_METRIC_ID]: stored }, notes: data.note, createdAt: now.toISOString(),
        };
    await setDoc(doc(db, 'users', userId, ENTRIES_COL, docData.id), stripUndefined(docData));
    return data.date;
  }, [userId, habit, metric, raw, updateHabit]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'users', userId!, ENTRIES_COL, id));
  }, [userId]);

  return { entries, loaded: habitsLoaded && entriesLoaded, upsert, remove };
}

export function useWeightTarget(userId: string | null | undefined) {
  const { habit, habitsLoaded } = useWeightHabit(userId);
  const metric = habit ? weightMetricOf(habit) : undefined;
  const unit: WeightUnit = metric?.unit === 'lbs' ? 'lbs' : 'kg';

  const target: WeightTarget | null = useMemo(() => {
    if (!metric?.target) return null;
    return stripUndefined({
      value: Math.round(fromKg(metric.target.value, unit) * 100) / 100, unit, byDate: metric.target.byDate,
    }) as unknown as WeightTarget;
  }, [metric, unit]);

  const setTarget = useCallback(async (next: MetricDef['target'] | undefined) => {
    if (!habit) throw new Error('The Weight habit is still being set up — try again in a moment.');
    const metrics = withWeightMetric(habit, (m) => {
      const { target: _old, ...rest } = m;
      return next ? { ...rest, target: next } : rest;
    });
    await updateDoc(doc(db, 'users', userId!, HABITS_COL, habit.id), { metrics });
  }, [userId, habit]);

  const save = useCallback(async (value: number, targetUnit: WeightUnit, byDate?: string) => {
    await setTarget(stripUndefined({ value: toKg(value, targetUnit), byDate }) as MetricDef['target']);
  }, [setTarget]);

  const clear = useCallback(() => setTarget(undefined), [setTarget]);

  return { target, loaded: habitsLoaded, save, clear };
}
