export type ExerciseType = 'strength' | 'cardio';

export interface ExerciseParam {
  id: string;
  name: string;          // e.g. "Weight"
  unit: string;          // e.g. "kg"
  required: boolean;
  defaultValue?: string; // shown as placeholder in logger
}

export interface Exercise {
  id: string;
  name: string;
  type: ExerciseType;            // default 'strength' for legacy docs
  muscleGroup?: string;          // formerly `category`; strength subgroup
  imageUri?: string;
  series?: number;               // strength, default 3
  repsMin?: number;              // strength, default 8
  repsMax?: number;              // strength, default 10
  durationMin?: number;          // cardio, default 30
  params: ExerciseParam[];       // default []
  notes?: string;                // exercise-level note shown in logger
  description?: string;          // legacy alias for notes; read-only
  category?: string;             // legacy read-only
  createdAt: string;
}

export interface ParamValue {
  paramId: string;
  value: string;
}

export interface SeriesEntry {
  reps?: number;
  weight?: number;
  weightUnit?: 'kg' | 'lbs';
}

export interface ExerciseExecution {
  id: string;
  exerciseId: string;
  date: string;                  // ISO yyyy-mm-dd
  routineExecutionId?: string;   // set when logged as part of a routine execution
  series?: number;               // legacy: total series count
  reps?: number;                 // legacy: single reps value
  durationMin?: number;
  weight?: number;               // legacy: single weight value
  weightUnit?: 'kg' | 'lbs';
  seriesData?: SeriesEntry[];    // per-series reps + weight; replaces series/reps/weight for strength
  paramValues: ParamValue[];
  completed: boolean;
  createdAt: string;
}

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';

export interface RoutineSchedule {
  frequency: ScheduleFrequency;
  daysOfWeek?: number[];         // weekly: 0=Sun..6=Sat
  dayOfMonth?: number;           // monthly: 1..31
}

export interface Routine {
  id: string;
  name: string;
  description?: string;
  exerciseIds: string[];
  schedule: RoutineSchedule;
  graceDays: number;             // default 2
  startDate: string;             // ISO yyyy-mm-dd
  createdAt: string;
}

export type RoutineExecStatus = 'pending' | 'completed' | 'failed';

export interface RoutineExecution {
  id: string;                    // deterministic `${routineId}_${dueDate}`
  routineId: string;
  dueDate: string;               // ISO yyyy-mm-dd
  status: RoutineExecStatus;
  completedAt?: string;
  createdAt: string;
}

// ── Helpers for reading possibly-legacy exercise docs ───────────────────────

export const STRENGTH_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Arms', 'Core', 'Legs', 'Other'];

export function exerciseType(ex: Exercise): ExerciseType {
  if (ex.type) return ex.type;
  return ex.category === 'Cardio' ? 'cardio' : 'strength';
}

export function exerciseMuscleGroup(ex: Exercise): string {
  return ex.muscleGroup ?? (ex.category && ex.category !== 'Cardio' ? ex.category : 'Other');
}
