import { colors } from '../theme';

export type WeightUnit = 'kg' | 'lbs';

export interface WeightEntry {
  id: string;          // same as `date` — one entry per day
  date: string;         // ISO yyyy-mm-dd
  value: number;
  unit: WeightUnit;
  note?: string;
  createdAt: string;
}

export interface WeightTarget {
  value: number;
  unit: WeightUnit;
  byDate?: string; // ISO yyyy-mm-dd; optional deadline for reaching the target
}

const LBS_PER_KG = 2.2046226218;

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value / LBS_PER_KG;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * LBS_PER_KG;
}

export function formatDelta(deltaKg: number, unit: WeightUnit): string {
  const v = fromKg(Math.abs(deltaKg), unit);
  const arrow = deltaKg > 0 ? '↑' : deltaKg < 0 ? '↓' : '';
  return `${arrow}${arrow ? ' ' : ''}${v.toFixed(1)} ${unit}`;
}

export function deltaColor(delta: number | null) {
  if (delta == null || Math.abs(delta) < 0.05) return { color: colors.textMuted };
  return { color: delta > 0 ? colors.danger : colors.success };
}
