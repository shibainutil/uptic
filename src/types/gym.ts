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
  sets?: number;                 // strength, default 3
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

export interface SetEntry {
  reps?: number;
  weight?: number;
  weightUnit?: 'kg' | 'lbs';
  skipped?: boolean;             // this specific set was skipped
}

export interface ExerciseExecution {
  id: string;
  exerciseId: string;
  date: string;                  // ISO yyyy-mm-dd
  routineExecutionId?: string;   // set when logged as part of a routine execution
  sets?: number;                 // legacy: total set count
  reps?: number;                 // legacy: single reps value
  durationMin?: number;
  // Wall-clock timestamp (ISO) of when the cardio timer was last started; `durationMin`
  // holds the baseline accumulated before this run. Elapsed while running is derived as
  // durationMin + (now - timerStartedAt), so it survives navigation/backgrounding/remounts
  // without depending on JS intervals ticking continuously. Cleared (null) on stop.
  timerStartedAt?: string | null;
  weight?: number;               // legacy: single weight value
  weightUnit?: 'kg' | 'lbs';
  setData?: SetEntry[];          // per-set reps + weight; replaces sets/reps/weight for strength
  paramValues: ParamValue[];
  completed: boolean;
  skipped?: boolean;              // whole exercise skipped — either by the user or once the parent routine execution failed
  notes?: string;
  createdAt: string;
}

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';

export interface RoutineSchedule {
  frequency: ScheduleFrequency;
  daysOfWeek?: number[];         // weekly: 0=Sun..6=Sat
  dayOfMonth?: number;           // monthly: 1..31
}

export type ExerciseRole = 'warmup' | 'mandatory' | 'optional';

export interface Routine {
  id: string;
  name: string;
  description?: string;
  exerciseIds: string[];
  exerciseRoles?: Record<string, ExerciseRole>; // exerciseId -> role; absent entries default to 'mandatory'
  schedule: RoutineSchedule;
  startDate: string;             // ISO yyyy-mm-dd
  createdAt: string;
}

export function exerciseRole(routine: Pick<Routine, 'exerciseRoles'> | undefined, exerciseId: string): ExerciseRole {
  return routine?.exerciseRoles?.[exerciseId] ?? 'mandatory';
}

export type RoutineExecStatus = 'pending' | 'completed' | 'failed';

export interface RoutineExecution {
  id: string;                    // deterministic `${routineId}_${scheduledDate}` — stable across reschedules
  routineId: string;
  dueDate: string;               // ISO yyyy-mm-dd; may differ from the id's date after a reschedule
  status: RoutineExecStatus;
  completedAt?: string;
  createdAt: string;
  rescheduledTo?: string;        // set when rescheduled; keeps doc alive so reconciler won't recreate it
  deleted?: boolean;             // user hard-deleted this occurrence; keeps doc alive (same reason) but hidden everywhere
  removedExerciseIds?: string[]; // exercises hidden from routine.exerciseIds for this execution only
  addedExerciseIds?: string[];   // extra exercises included only for this execution
  // Frozen copy of the routine's exerciseIds/exerciseRoles, written the moment the user
  // first logs anything for this execution. Once present, this execution stops tracking
  // live edits to the routine template — so editing a routine can't retroactively change
  // an occurrence that's already in progress or further along (completed/incomplete/skipped).
  // Absent while the execution is still untouched (pending/scheduled/overdue-with-nothing-logged),
  // so those still reflect routine edits made before the user actually starts them.
  snapshotExerciseIds?: string[];
  snapshotExerciseRoles?: Record<string, ExerciseRole>;
}

/** The exercise list for one specific execution: the routine's template (or this
 * execution's frozen snapshot, once it has one), with this execution's own
 * additions/removals applied. Never mutates the routine. */
export function effectiveExerciseIds(routine: Routine | undefined, exec: RoutineExecution): string[] {
  const removed = new Set(exec.removedExerciseIds ?? []);
  const baseIds = exec.snapshotExerciseIds ?? routine?.exerciseIds ?? [];
  const base = baseIds.filter((id) => !removed.has(id));
  const added = (exec.addedExerciseIds ?? []).filter((id) => !base.includes(id));
  return [...base, ...added];
}

/** Same snapshot-vs-live-routine logic as effectiveExerciseIds, but for a single exercise's role. */
export function effectiveExerciseRole(routine: Routine | undefined, exec: RoutineExecution, exerciseId: string): ExerciseRole {
  const roles = exec.snapshotExerciseRoles ?? routine?.exerciseRoles;
  return roles?.[exerciseId] ?? 'mandatory';
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
