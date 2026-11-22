import { addDays, diffDays, fromISO, toISO } from './schedule';
import { toKg, type WeightEntry } from '../types/weight';

export type PeriodMode = 'week' | 'month';

export interface WeightPeriod {
  /** Start date of the period (Monday for weeks, the 1st for months) — unique per period. */
  key: string;
  startISO: string;
  /** Inclusive last day of the period. */
  endISO: string;
  avgKg: number;
  minKg: number;
  maxKg: number;
  /** Mean date of the period's entries — where its average is plotted on the time axis,
   * so a partial (e.g. current) week never lands in the future. */
  centerISO: string;
  /** The period's entries, oldest first. */
  entries: WeightEntry[];
}

export function periodStart(iso: string, mode: PeriodMode): string {
  const d = fromISO(iso);
  if (mode === 'month') return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
  const daysSinceMonday = (d.getDay() + 6) % 7;
  return addDays(iso, -daysSinceMonday);
}

export function periodEnd(startISO: string, mode: PeriodMode): string {
  if (mode === 'week') return addDays(startISO, 6);
  const d = fromISO(startISO);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Buckets ascending entries into calendar weeks (Mon–Sun) or months, averaging each bucket. */
export function groupWeightPeriods(ascending: WeightEntry[], mode: PeriodMode): WeightPeriod[] {
  const periods: WeightPeriod[] = [];
  for (const e of ascending) {
    const key = periodStart(e.date, mode);
    const last = periods[periods.length - 1];
    if (last && last.key === key) {
      last.entries.push(e);
    } else {
      periods.push({
        key, startISO: key, endISO: periodEnd(key, mode),
        avgKg: 0, minKg: 0, maxKg: 0, centerISO: e.date, entries: [e],
      });
    }
  }
  for (const p of periods) {
    const kgs = p.entries.map((e) => toKg(e.value, e.unit));
    p.avgKg = kgs.reduce((a, b) => a + b, 0) / kgs.length;
    p.minKg = Math.min(...kgs);
    p.maxKg = Math.max(...kgs);
    const base = p.entries[0].date;
    const meanOffset = p.entries.reduce((a, e) => a + diffDays(e.date, base), 0) / p.entries.length;
    p.centerISO = addDays(base, Math.round(meanOffset));
  }
  return periods;
}

const SHORT_MONTH: Intl.DateTimeFormatOptions = { month: 'short' };

/** "17–23 Nov 2026", "28 Oct – 3 Nov 2026", "29 Dec – 4 Jan 2027" (year of the week's Sunday). */
export function formatPeriodLabel(p: WeightPeriod, mode: PeriodMode): string {
  const start = fromISO(p.startISO);
  const end = fromISO(p.endISO);
  if (mode === 'month') {
    return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  const yearSuffix = ` ${end.getFullYear()}`;
  const startMonth = start.toLocaleDateString(undefined, SHORT_MONTH);
  const endMonth = end.toLocaleDateString(undefined, SHORT_MONTH);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${endMonth}${yearSuffix}`;
  }
  return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}${yearSuffix}`;
}
