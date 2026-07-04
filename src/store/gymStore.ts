import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useState, useCallback, useRef } from 'react';
import { db } from '../firebase';
import type {
  Exercise,
  ExerciseExecution,
  Routine,
  RoutineExecution,
  RoutineExecStatus,
} from '../types/gym';
import { reconcileRoutineExecutions, todayISO } from '../lib/schedule';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function userCol(uid: string, col: string) {
  return collection(db, 'users', uid, col);
}

function userDoc(uid: string, col: string, id: string) {
  return doc(db, 'users', uid, col, id);
}

function stripUndefined(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// Firestore docs written before the series -> set rename still use the old field
// names. Read-time fallback so old data keeps displaying correctly; the next save
// writes it back out under the new field names.
function normalizeExercise(raw: Record<string, unknown>): Exercise {
  return { ...raw, sets: raw.sets ?? raw.series } as Exercise;
}

function normalizeExerciseExecution(raw: Record<string, unknown>): ExerciseExecution {
  return {
    ...raw,
    sets: raw.sets ?? raw.series,
    setData: raw.setData ?? raw.seriesData,
  } as ExerciseExecution;
}

// ── Exercises ──────────────────────────────────────────────────────────────

export function useExercises(userId: string | null | undefined) {
  const [exercises, setExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    if (!userId) {
      setExercises([]);
      return;
    }
    const unsub = onSnapshot(userCol(userId, 'exercises'), (snap) => {
      setExercises(snap.docs.map((d) => normalizeExercise(d.data())));
    });
    return unsub;
  }, [userId]);

  const add = useCallback(async (data: Omit<Exercise, 'id' | 'createdAt'>): Promise<string> => {
    const id = uid();
    const docData = { ...data, id, createdAt: new Date().toISOString() };
    await setDoc(userDoc(userId!, 'exercises', id), stripUndefined(docData));
    return id;
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<Exercise>) => {
    await updateDoc(userDoc(userId!, 'exercises', id), stripUndefined(data as Record<string, unknown>));
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(userDoc(userId!, 'exercises', id));
  }, [userId]);

  return { exercises, add, update, remove };
}

// ── Exercise Executions ──────────────────────────────────────────────────────

export function useExerciseExecutions(userId: string | null | undefined) {
  const [executions, setExecutions] = useState<ExerciseExecution[]>([]);

  useEffect(() => {
    if (!userId) {
      setExecutions([]);
      return;
    }
    const unsub = onSnapshot(userCol(userId, 'exerciseExecutions'), (snap) => {
      setExecutions(snap.docs.map((d) => normalizeExerciseExecution(d.data())));
    });
    return unsub;
  }, [userId]);

  const add = useCallback(async (data: Omit<ExerciseExecution, 'id' | 'createdAt'>): Promise<string> => {
    const id = uid();
    const docData = { ...data, id, createdAt: new Date().toISOString() };
    await setDoc(userDoc(userId!, 'exerciseExecutions', id), stripUndefined(docData));
    return id;
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<ExerciseExecution>) => {
    await updateDoc(userDoc(userId!, 'exerciseExecutions', id), stripUndefined(data as Record<string, unknown>));
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(userDoc(userId!, 'exerciseExecutions', id));
  }, [userId]);

  return { executions, add, update, remove };
}

// ── Routines ─────────────────────────────────────────────────────────────────

export function useRoutines(userId: string | null | undefined) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setRoutines([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(userCol(userId, 'routines'), (snap) => {
      setRoutines(snap.docs.map((d) => d.data() as Routine));
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const add = useCallback(async (data: Omit<Routine, 'id' | 'createdAt'>): Promise<string> => {
    const id = uid();
    const docData = { ...data, id, createdAt: new Date().toISOString() };
    await setDoc(userDoc(userId!, 'routines', id), stripUndefined(docData));
    return id;
  }, [userId]);

  const update = useCallback(async (id: string, data: Partial<Routine>) => {
    await updateDoc(userDoc(userId!, 'routines', id), stripUndefined(data as Record<string, unknown>));
  }, [userId]);

  // Deleting a routine cascades to its routine executions.
  const remove = useCallback(async (id: string) => {
    const execSnap = await getDocs(
      query(userCol(userId!, 'routineExecutions'), where('routineId', '==', id)),
    );
    const batch = writeBatch(db);
    execSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(userDoc(userId!, 'routines', id));
    await batch.commit();
  }, [userId]);

  return { routines, loaded, add, update, remove };
}

// ── Routine Executions ───────────────────────────────────────────────────────

export function useRoutineExecutions(userId: string | null | undefined) {
  const [routineExecutions, setRoutineExecutions] = useState<RoutineExecution[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setRoutineExecutions([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(userCol(userId, 'routineExecutions'), (snap) => {
      setRoutineExecutions(snap.docs.map((d) => d.data() as RoutineExecution));
      setLoaded(true);
    });
    return unsub;
  }, [userId]);

  const setStatus = useCallback(async (id: string, status: RoutineExecStatus) => {
    await updateDoc(userDoc(userId!, 'routineExecutions', id), {
      status,
      completedAt: status === 'completed' ? new Date().toISOString() : null,
    });
  }, [userId]);

  // Reschedule: delete old doc, create new one at newDate, move exercise execution refs.
  // The reconciler won't recreate the original date since a doc already exists for it
  // (rescheduledTo tombstone). The new doc's id prevents a duplicate at the new date.
  const reschedule = useCallback(async (exec: RoutineExecution, newDate: string) => {
    const newId = `${exec.routineId}_${newDate}`;
    const exSnap = await getDocs(
      query(userCol(userId!, 'exerciseExecutions'), where('routineExecutionId', '==', exec.id)),
    );
    const batch = writeBatch(db);
    // Mark old doc rescheduledTo instead of deleting so the reconciler won't recreate it
    // (reconciler skips dates where a doc already exists, even with rescheduledTo set).
    batch.update(userDoc(userId!, 'routineExecutions', exec.id), { rescheduledTo: newDate });
    batch.set(userDoc(userId!, 'routineExecutions', newId), stripUndefined({
      ...exec, id: newId, dueDate: newDate, status: 'pending', completedAt: null, rescheduledTo: undefined,
    }));
    exSnap.docs.forEach((d) => batch.update(d.ref, { routineExecutionId: newId }));
    await batch.commit();
  }, [userId]);

  // Deletes all logged exercise executions, but keeps the routine execution doc itself
  // (marked `deleted`) rather than removing it — deleting it outright would free up its
  // id, and the reconciler would immediately recreate a fresh pending occurrence on the
  // next check, making the delete look like it "undid itself". The tombstone is filtered
  // out of every UI list, same as a reschedule.
  const remove = useCallback(async (id: string) => {
    const exSnap = await getDocs(
      query(userCol(userId!, 'exerciseExecutions'), where('routineExecutionId', '==', id)),
    );
    const batch = writeBatch(db);
    exSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.update(userDoc(userId!, 'routineExecutions', id), { deleted: true });
    await batch.commit();
  }, [userId]);

  // Adds an exercise to this execution only — the routine template is untouched.
  const addExerciseToExecution = useCallback(async (exec: RoutineExecution, exerciseId: string) => {
    const added = new Set(exec.addedExerciseIds ?? []);
    added.add(exerciseId);
    const removed = (exec.removedExerciseIds ?? []).filter((id) => id !== exerciseId);
    await updateDoc(userDoc(userId!, 'routineExecutions', exec.id), stripUndefined({
      addedExerciseIds: [...added],
      removedExerciseIds: removed,
    }));
  }, [userId]);

  // Removes an exercise from this execution only (hides it even though the routine still lists it),
  // and deletes any logged data for it on this execution so nothing orphaned is left behind.
  const removeExerciseFromExecution = useCallback(async (exec: RoutineExecution, exerciseId: string) => {
    const removed = new Set(exec.removedExerciseIds ?? []);
    removed.add(exerciseId);
    const added = (exec.addedExerciseIds ?? []).filter((id) => id !== exerciseId);
    const exSnap = await getDocs(query(
      userCol(userId!, 'exerciseExecutions'),
      where('routineExecutionId', '==', exec.id),
      where('exerciseId', '==', exerciseId),
    ));
    const batch = writeBatch(db);
    exSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.update(userDoc(userId!, 'routineExecutions', exec.id), stripUndefined({
      removedExerciseIds: [...removed],
      addedExerciseIds: added,
    }));
    await batch.commit();
  }, [userId]);

  // Swaps one exercise for another on this execution only.
  const replaceExerciseInExecution = useCallback(async (
    exec: RoutineExecution, oldExerciseId: string, newExerciseId: string,
  ) => {
    await removeExerciseFromExecution(exec, oldExerciseId);
    await addExerciseToExecution(
      { ...exec, removedExerciseIds: [...(exec.removedExerciseIds ?? []), oldExerciseId] },
      newExerciseId,
    );
  }, [removeExerciseFromExecution, addExerciseToExecution]);

  return {
    routineExecutions, loaded, setStatus, reschedule, remove,
    addExerciseToExecution, removeExerciseFromExecution, replaceExerciseInExecution,
  };
}

/**
 * Generates pending routine executions for due dates and fails overdue ones.
 * Mount once (e.g. in the fitness screen); runs when routines/executions settle.
 */
export function useRoutineReconcile(
  userId: string | null | undefined,
  routines: Routine[],
  routineExecutions: RoutineExecution[],
  exerciseExecutions: ExerciseExecution[],
  executionsLoaded: boolean,
) {
  const running = useRef(false);

  useEffect(() => {
    if (!userId || routines.length === 0 || !executionsLoaded || running.current) return;
    const { toCreate, toFail, exerciseExecsToSkip, exerciseExecsToCreateSkipped } =
      reconcileRoutineExecutions(routines, routineExecutions, exerciseExecutions, todayISO());
    if (toCreate.length === 0 && toFail.length === 0 && exerciseExecsToSkip.length === 0
      && exerciseExecsToCreateSkipped.length === 0) return;

    running.current = true;
    const batch = writeBatch(db);
    toCreate.forEach((exec) => batch.set(userDoc(userId, 'routineExecutions', exec.id), stripUndefined(exec)));
    toFail.forEach((id) => batch.update(userDoc(userId, 'routineExecutions', id), { status: 'failed' }));
    exerciseExecsToSkip.forEach((id) => batch.update(userDoc(userId, 'exerciseExecutions', id), { skipped: true }));
    exerciseExecsToCreateSkipped.forEach((exec) =>
      batch.set(userDoc(userId, 'exerciseExecutions', exec.id), stripUndefined(exec)));
    batch
      .commit()
      .catch(() => { /* surfaced on next reconcile */ })
      .finally(() => { running.current = false; });
  }, [userId, routines, routineExecutions, exerciseExecutions, executionsLoaded]);
}
