import { diffDays, addDays } from './schedule';
import { toKg, type WeightEntry } from '../types/weight';

export interface TrendFit {
  baseDate: string;         // ISO date the fit is anchored to (ascending[0].date)
  slopeKgPerDay: number;
  interceptKg: number;
}

/** Least-squares linear fit of weight (kg) over real calendar days. Needs entries spanning >=2 distinct days. */
export function fitWeightTrend(ascending: WeightEntry[]): TrendFit | null {
  if (ascending.length < 2) return null;
  const baseDate = ascending[0].date;
  const xs = ascending.map((e) => diffDays(e.date, baseDate));
  const ys = ascending.map((e) => toKg(e.value, e.unit));
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null; // all entries on the same day
  const slopeKgPerDay = (n * sumXY - sumX * sumY) / denom;
  const interceptKg = (sumY - slopeKgPerDay * sumX) / n;
  return { baseDate, slopeKgPerDay, interceptKg };
}

export function trendKgAt(fit: TrendFit, iso: string): number {
  return fit.interceptKg + fit.slopeKgPerDay * diffDays(iso, fit.baseDate);
}

export type Prognosis =
  | { kind: 'reached' }
  | { kind: 'onTrack'; date: string; daysAway: number }
  | { kind: 'notTrending' }
  | { kind: 'insufficientData' };

/** Projects when `targetKg` would be reached following the current linear trend. */
export function prognose(fit: TrendFit | null, targetKg: number, today: string): Prognosis {
  if (!fit) return { kind: 'insufficientData' };
  const diff = targetKg - trendKgAt(fit, today);
  if (Math.abs(diff) < 0.05) return { kind: 'reached' };
  const movingTowardTarget = fit.slopeKgPerDay !== 0 && Math.sign(diff) === Math.sign(fit.slopeKgPerDay);
  if (!movingTowardTarget) return { kind: 'notTrending' };
  const dayOffset = (targetKg - fit.interceptKg) / fit.slopeKgPerDay;
  const date = addDays(fit.baseDate, Math.round(dayOffset));
  return { kind: 'onTrack', date, daysAway: diffDays(date, today) };
}

export function humanizeDaysAway(days: number): string {
  if (days <= 0) return 'any day now';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}
