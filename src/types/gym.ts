export type ExerciseType = 'strength' | 'cardio';

export interface ExerciseParam {
  id: string;
  name: string;          // e.g. "Weight"
  unit: string;          // e.g. "kg"
  required: boolean;
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
  description?: string;
  category?: string;             // legacy read-only
  createdAt: string;
}

export interface ParamValue {
  paramId: string;
  value: string;
}

export interface ExerciseExecution {
  id: string;
  exerciseId: string;
  date: string;                  // ISO yyyy-mm-dd
  series?: number;
  reps?: number;
  durationMin?: number;
  weight?: number;
  weightUnit?: 'kg' | 'lbs';
  paramValues: ParamValue[];
  completed: boolean;
  notes?: string;
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

export const STRENGTH_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Legs', 'Other'];

export function exerciseType(ex: Exercise): ExerciseType {
  if (ex.type) return ex.type;
  return ex.category === 'Cardio' ? 'cardio' : 'strength';
}

export function exerciseMuscleGroup(ex: Exercise): string {
  return ex.muscleGroup ?? (ex.category && ex.category !== 'Cardio' ? ex.category : 'Other');
}
