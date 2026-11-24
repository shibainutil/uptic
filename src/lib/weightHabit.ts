import { toISO } from './schedule';
import { fromKg, type WeightEntry, type WeightUnit } from '../types/weight';
import type { Habit, HabitLogEntry, MetricDef } from '../types/habits';

/** Fixed ids: the Weight habit is unique per user, and its entries are one per day. */
export const WEIGHT_HABIT_ID = 'weight';
export const WEIGHT_METRIC_ID = 'weight';

export const weightEntryId = (date: string) => `weight-${date}`;

export function weightMetricOf(habit: Habit): MetricDef | undefined {
  return habit.metrics?.find((m) => m.id === WEIGHT_METRIC_ID);
}

export function newWeightHabit(unit: WeightUnit, target?: MetricDef['target']): Omit<Habit, 'createdAt'> {
  return {
    id: WEIGHT_HABIT_ID,
    name: 'Weight',
    kind: 'continuous',
    startDate: toISO(new Date()),
    schedule: { unit: 'day', interval: 1, timesOfDay: ['08:00'] },
    system: 'weight',
    metrics: [{
      id: WEIGHT_METRIC_ID, name: 'Weight', unit, decimals: 1, direction: 'down', quantity: 'weight',
      ...(target ? { target } : {}),
    }],
  };
}

/** When a weigh-in on `date` is logged: its real time if recorded that day, else noon. */
export function weighInLoggedAt(date: string, recorded: Date): string {
  if (toISO(recorded) === date) return recorded.toISOString();
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, 12, 0, 0, 0).toISOString();
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A habit log entry as the Weight tab's WeightEntry (shown in the metric's unit). */
export function toWeightEntry(metric: MetricDef, e: HabitLogEntry): WeightEntry {
  const unit: WeightUnit = metric.unit === 'lbs' ? 'lbs' : 'kg';
  return {
    id: e.id,
    date: toISO(new Date(e.loggedAt)),
    value: round2(fromKg(e.values![WEIGHT_METRIC_ID], unit)),
    unit,
    note: e.notes,
    createdAt: e.createdAt,
  };
}
