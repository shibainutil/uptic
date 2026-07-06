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
}

const LBS_PER_KG = 2.2046226218;

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value / LBS_PER_KG;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * LBS_PER_KG;
}
